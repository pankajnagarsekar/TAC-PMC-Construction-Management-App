"""
PHASE 2 WAVE 1: HARDENED FINANCIAL ENGINE

Implements:
1. Decimal Precision Lock (Section 1)
2. Transaction Atomicity (Section 2)
3. Financial Invariant Enforcement (Section 3)
4. Duplicate Invoice Protection (Section 4)
5. Atomic Document Numbering (Section 5)

ALL financial operations wrapped in MongoDB transactions.
ALL calculations use Decimal for precision.
ALL mutations enforce invariants before commit.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from decimal import Decimal
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status
from typing import Optional, Dict, Any, List
import logging
import asyncio

from core.financial_precision import (
    to_decimal, round_financial, to_float,
    validate_non_negative, validate_positive,
    safe_multiply, safe_divide, safe_subtract, safe_add,
    calculate_percentage, calculate_wo_values, calculate_pc_values,
    NegativeValueError
)
from core.invariant_validator import (
    FinancialInvariantValidator, InvariantViolationError
)
from core.duplicate_protection import (
    DuplicateInvoiceProtection, DuplicateInvoiceError
)
from core.atomic_numbering import (
    AtomicDocumentNumbering, SequenceCollisionError
)

logger = logging.getLogger(__name__)


class TransactionError(Exception):
    """Raised when a transaction fails"""
    pass


class HardenedFinancialEngine:
    """
    Hardened Financial Engine with:
    - Decimal precision (2 places)
    - ACID transactions
    - Invariant enforcement
    - Duplicate protection
    - Atomic document numbering
    """
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
        self.invariant_validator = FinancialInvariantValidator(db)
        self.duplicate_protection = DuplicateInvoiceProtection(db)
        self.document_numbering = AtomicDocumentNumbering(db)
    
    # =========================================================================
    # SECTION 1: DECIMAL PRECISION RECALCULATION ENGINE
    # =========================================================================
    
    async def recalculate_financials_with_precision(
        self,
        project_id: str,
        code_id: str,
        session=None
    ) -> Dict[str, Any]:
        """
        Recalculate all derived financial state using Decimal precision.
        
        LOCKED FORMULAS (all use Decimal internally, stored as float):
        - committed_value = SUM(base_amount) from Issued WOs
        - certified_value = SUM(current_bill_amount) from Certified PCs
        - paid_value = SUM(payment_amount) from Payments
        - retention_held = total_retention_cumulative - released_sum
        - balance_budget_remaining = approved_budget - certified_value
        - balance_to_pay = certified_value - paid_value
        """
        # Get approved budget
        budget = await self.db.project_budgets.find_one(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        if not budget:
            logger.warning(f"No budget for project:{project_id}, code:{code_id}")
            return None
        
        approved_budget = to_decimal(budget["approved_budget_amount"])
        
        # Calculate committed_value from Work Orders (Decimal precision)
        wo_cursor = self.db.work_orders.find(
            {
                "project_id": project_id,
                "code_id": code_id,
                "status": {"$in": ["Issued", "Revised"]}
            },
            session=session
        )
        
        committed_value = Decimal('0')
        async for wo in wo_cursor:
            committed_value += to_decimal(wo.get("base_amount", 0))
        
        # Calculate certified_value from Payment Certificates (Decimal precision)
        pc_cursor = self.db.payment_certificates.find(
            {
                "project_id": project_id,
                "code_id": code_id,
                "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
            },
            session=session
        )
        
        certified_value = Decimal('0')
        total_retention_cumulative = Decimal('0')
        async for pc in pc_cursor:
            certified_value += to_decimal(pc.get("current_bill_amount", 0))
            total_retention_cumulative += to_decimal(pc.get("retention_current", 0))
        
        # Calculate paid_value from Payments (Decimal precision)
        payment_cursor = self.db.payments.find(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        paid_value = Decimal('0')
        async for payment in payment_cursor:
            paid_value += to_decimal(payment.get("payment_amount", 0))
        
        # Calculate released retention (Decimal precision)
        release_cursor = self.db.retention_releases.find(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        released_sum = Decimal('0')
        async for release in release_cursor:
            released_sum += to_decimal(release.get("release_amount", 0))
        
        # Calculate derived values with Decimal precision
        retention_held = safe_subtract(total_retention_cumulative, released_sum)
        balance_budget_remaining = safe_subtract(approved_budget, certified_value)
        balance_to_pay = safe_subtract(certified_value, paid_value)
        
        # Calculate flags
        over_commit_flag = committed_value > approved_budget
        over_certification_flag = certified_value > approved_budget
        over_payment_flag = paid_value > certified_value
        
        # Round at boundary and convert to float for storage
        state_data = {
            "project_id": project_id,
            "code_id": code_id,
            "committed_value": to_float(round_financial(committed_value)),
            "certified_value": to_float(round_financial(certified_value)),
            "paid_value": to_float(round_financial(paid_value)),
            "retention_held": to_float(round_financial(retention_held)),
            "balance_budget_remaining": to_float(round_financial(balance_budget_remaining)),
            "balance_to_pay": to_float(round_financial(balance_to_pay)),
            "over_commit_flag": over_commit_flag,
            "over_certification_flag": over_certification_flag,
            "over_payment_flag": over_payment_flag,
            "last_recalculated_at": datetime.utcnow()
        }
        
        await self.db.derived_financial_state.update_one(
            {"project_id": project_id, "code_id": code_id},
            {"$set": state_data},
            upsert=True,
            session=session
        )
        
        logger.info(f"[PRECISION] Recalculated: project={project_id}, code={code_id}")
        logger.debug(f"  committed={state_data['committed_value']}, certified={state_data['certified_value']}, "
                    f"paid={state_data['paid_value']}, retention_held={state_data['retention_held']}")
        
        return state_data
    
    # =========================================================================
    # SECTION 2 & 3: TRANSACTIONAL WORK ORDER OPERATIONS WITH INVARIANTS
    # =========================================================================
    
    async def issue_work_order(
        self,
        wo_id: str,
        organisation_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Issue a Work Order (transition from Draft to Issued).
        
        TRANSACTION: Atomic operation with full rollback on failure.
        SECTION 5: Assigns atomic document number on Issue only.
        SECTION 3: Validates financial invariants before commit.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    # Get the work order
                    wo = await self.db.work_orders.find_one(
                        {"_id": ObjectId(wo_id)},
                        session=session
                    )
                    
                    if not wo:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Work Order not found"
                        )
                    
                    if wo["status"] != "Draft":
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot issue WO in status: {wo['status']}"
                        )
                    
                    # SECTION 5: Generate atomic document number
                    doc_number, sequence = await self.document_numbering.generate_document_number(
                        organisation_id=organisation_id,
                        prefix=wo.get("prefix", "WO"),
                        session=session
                    )
                    
                    # Update WO to Issued status
                    update_data = {
                        "status": "Issued",
                        "document_number": doc_number,
                        "sequence_number": sequence,
                        "locked_flag": True,
                        "updated_at": datetime.utcnow(),
                        "issued_by": user_id,
                        "issued_at": datetime.utcnow()
                    }
                    
                    await self.db.work_orders.update_one(
                        {"_id": ObjectId(wo_id)},
                        {"$set": update_data},
                        session=session
                    )
                    
                    # Create version snapshot
                    await self._create_wo_version_snapshot(wo_id, 1, session)
                    
                    # Recalculate financials with precision
                    await self.recalculate_financials_with_precision(
                        wo["project_id"],
                        wo["code_id"],
                        session=session
                    )
                    
                    # SECTION 3: Validate invariants BEFORE commit
                    await self.invariant_validator.validate_project_code_invariants(
                        wo["project_id"],
                        wo["code_id"],
                        session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=wo["project_id"],
                        module="WORK_ORDER",
                        entity_type="WORK_ORDER",
                        entity_id=wo_id,
                        action="ISSUE",
                        user_id=user_id,
                        new_value={"document_number": doc_number, "status": "Issued"},
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] WO Issued: {wo_id} -> {doc_number}")
                    
                    # Transaction commits automatically on context exit
                    return {
                        "wo_id": wo_id,
                        "document_number": doc_number,
                        "status": "Issued"
                    }
                    
                except InvariantViolationError as e:
                    logger.error(f"[INVARIANT VIOLATION] WO Issue failed: {e.message}")
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=wo.get("project_id"),
                        module="WORK_ORDER",
                        entity_type="WORK_ORDER",
                        entity_id=wo_id,
                        action="ISSUE_FAILED",
                        user_id=user_id,
                        new_value={"error": e.message, "violations": e.details},
                        session=session
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] WO Issue: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    async def revise_work_order(
        self,
        wo_id: str,
        organisation_id: str,
        user_id: str,
        rate: Optional[float] = None,
        quantity: Optional[float] = None,
        retention_percentage: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Revise a Work Order.
        
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision for calculations.
        SECTION 3: Validates invariants before commit.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    wo = await self.db.work_orders.find_one(
                        {"_id": ObjectId(wo_id)},
                        session=session
                    )
                    
                    if not wo:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Work Order not found"
                        )
                    
                    if wo["status"] not in ["Issued", "Revised"]:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot revise WO in status: {wo['status']}"
                        )
                    
                    # Apply updates
                    new_rate = rate if rate is not None else wo["rate"]
                    new_quantity = quantity if quantity is not None else wo["quantity"]
                    new_retention = retention_percentage if retention_percentage is not None else wo["retention_percentage"]
                    
                    # SECTION 1: Calculate with Decimal precision
                    try:
                        wo_values = calculate_wo_values(new_rate, new_quantity, new_retention)
                    except NegativeValueError as e:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(e)
                        )
                    
                    new_version = wo["version_number"] + 1
                    
                    update_data = {
                        "rate": new_rate,
                        "quantity": new_quantity,
                        "retention_percentage": new_retention,
                        "base_amount": wo_values["base_amount"],
                        "retention_amount": wo_values["retention_amount"],
                        "net_wo_value": wo_values["net_wo_value"],
                        "status": "Revised",
                        "version_number": new_version,
                        "updated_at": datetime.utcnow(),
                        "revised_by": user_id,
                        "revised_at": datetime.utcnow()
                    }
                    
                    await self.db.work_orders.update_one(
                        {"_id": ObjectId(wo_id)},
                        {"$set": update_data},
                        session=session
                    )
                    
                    # Create version snapshot
                    await self._create_wo_version_snapshot(wo_id, new_version, session)
                    
                    # Recalculate financials with precision
                    await self.recalculate_financials_with_precision(
                        wo["project_id"],
                        wo["code_id"],
                        session=session
                    )
                    
                    # Validate invariants
                    await self.invariant_validator.validate_project_code_invariants(
                        wo["project_id"],
                        wo["code_id"],
                        session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=wo["project_id"],
                        module="WORK_ORDER",
                        entity_type="WORK_ORDER",
                        entity_id=wo_id,
                        action="REVISE",
                        user_id=user_id,
                        old_value={"rate": wo["rate"], "quantity": wo["quantity"]},
                        new_value=update_data,
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] WO Revised: {wo_id} v{new_version}")
                    
                    return {
                        "wo_id": wo_id,
                        "version": new_version,
                        "status": "Revised",
                        **wo_values
                    }
                    
                except InvariantViolationError as e:
                    logger.error(f"[INVARIANT VIOLATION] WO Revision failed: {e.message}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] WO Revision: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    # =========================================================================
    # SECTION 2, 3 & 4: TRANSACTIONAL PAYMENT CERTIFICATE WITH DUPLICATE CHECK
    # =========================================================================
    
    async def certify_payment_certificate(
        self,
        pc_id: str,
        organisation_id: str,
        user_id: str,
        invoice_number: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Certify a Payment Certificate.
        
        TRANSACTION: Atomic with rollback.
        SECTION 4: Checks for duplicate invoice before certification.
        SECTION 5: Assigns atomic document number on certification.
        SECTION 3: Validates invariants before commit.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    pc = await self.db.payment_certificates.find_one(
                        {"_id": ObjectId(pc_id)},
                        session=session
                    )
                    
                    if not pc:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Payment Certificate not found"
                        )
                    
                    if pc["status"] != "Draft":
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot certify PC in status: {pc['status']}"
                        )
                    
                    # SECTION 4: Check for duplicate invoice
                    if invoice_number:
                        try:
                            await self.duplicate_protection.check_duplicate_invoice(
                                vendor_id=pc["vendor_id"],
                                project_id=pc["project_id"],
                                invoice_number=invoice_number,
                                exclude_pc_id=pc_id,
                                session=session
                            )
                        except DuplicateInvoiceError as e:
                            logger.warning(f"[DUPLICATE INVOICE] {e}")
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Duplicate invoice detected: {invoice_number}"
                            )
                    
                    # SECTION 5: Generate atomic document number
                    doc_number, sequence = await self.document_numbering.generate_document_number(
                        organisation_id=organisation_id,
                        prefix=pc.get("prefix", "PC"),
                        session=session
                    )
                    
                    # Update PC to Certified status
                    update_data = {
                        "status": "Certified",
                        "document_number": doc_number,
                        "sequence_number": sequence,
                        "invoice_number": invoice_number,
                        "locked_flag": True,
                        "updated_at": datetime.utcnow(),
                        "certified_by": user_id,
                        "certified_at": datetime.utcnow()
                    }
                    
                    await self.db.payment_certificates.update_one(
                        {"_id": ObjectId(pc_id)},
                        {"$set": update_data},
                        session=session
                    )
                    
                    # Create version snapshot
                    await self._create_pc_version_snapshot(pc_id, 1, session)
                    
                    # Recalculate financials with precision
                    await self.recalculate_financials_with_precision(
                        pc["project_id"],
                        pc["code_id"],
                        session=session
                    )
                    
                    # SECTION 3: Validate invariants BEFORE commit
                    await self.invariant_validator.validate_project_code_invariants(
                        pc["project_id"],
                        pc["code_id"],
                        session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=pc["project_id"],
                        module="PAYMENT_CERTIFICATE",
                        entity_type="PAYMENT_CERTIFICATE",
                        entity_id=pc_id,
                        action="CERTIFY",
                        user_id=user_id,
                        new_value={"document_number": doc_number, "status": "Certified", "invoice_number": invoice_number},
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] PC Certified: {pc_id} -> {doc_number}")
                    
                    return {
                        "pc_id": pc_id,
                        "document_number": doc_number,
                        "invoice_number": invoice_number,
                        "status": "Certified"
                    }
                    
                except InvariantViolationError as e:
                    logger.error(f"[INVARIANT VIOLATION] PC Certification failed: {e.message}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] PC Certification: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    async def revise_payment_certificate(
        self,
        pc_id: str,
        organisation_id: str,
        user_id: str,
        current_bill_amount: Optional[float] = None,
        retention_percentage: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Revise a Payment Certificate.
        
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision.
        SECTION 3: Validates invariants before commit.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    pc = await self.db.payment_certificates.find_one(
                        {"_id": ObjectId(pc_id)},
                        session=session
                    )
                    
                    if not pc:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Payment Certificate not found"
                        )
                    
                    if pc["status"] not in ["Certified", "Partially Paid"]:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot revise PC in status: {pc['status']}"
                        )
                    
                    # Get project settings for GST
                    project = await self.db.projects.find_one(
                        {"_id": ObjectId(pc["project_id"])},
                        session=session
                    )
                    
                    cgst = project.get("project_cgst_percentage", 0) if project else 0
                    sgst = project.get("project_sgst_percentage", 0) if project else 0
                    
                    # Apply updates
                    new_bill_amount = current_bill_amount if current_bill_amount is not None else pc["current_bill_amount"]
                    new_retention = retention_percentage if retention_percentage is not None else pc["retention_percentage"]
                    
                    # SECTION 1: Calculate with Decimal precision
                    try:
                        pc_values = calculate_pc_values(
                            current_bill_amount=new_bill_amount,
                            cumulative_previous_certified=pc.get("cumulative_previous_certified", 0),
                            retention_percentage=new_retention,
                            cgst_percentage=cgst,
                            sgst_percentage=sgst
                        )
                    except NegativeValueError as e:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(e)
                        )
                    
                    new_version = pc["version_number"] + 1
                    
                    update_data = {
                        "current_bill_amount": new_bill_amount,
                        "retention_percentage": new_retention,
                        **pc_values,
                        "version_number": new_version,
                        "updated_at": datetime.utcnow(),
                        "revised_by": user_id,
                        "revised_at": datetime.utcnow()
                    }
                    
                    await self.db.payment_certificates.update_one(
                        {"_id": ObjectId(pc_id)},
                        {"$set": update_data},
                        session=session
                    )
                    
                    # Create version snapshot
                    await self._create_pc_version_snapshot(pc_id, new_version, session)
                    
                    # Recalculate financials
                    await self.recalculate_financials_with_precision(
                        pc["project_id"],
                        pc["code_id"],
                        session=session
                    )
                    
                    # Validate invariants
                    await self.invariant_validator.validate_project_code_invariants(
                        pc["project_id"],
                        pc["code_id"],
                        session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=pc["project_id"],
                        module="PAYMENT_CERTIFICATE",
                        entity_type="PAYMENT_CERTIFICATE",
                        entity_id=pc_id,
                        action="REVISE",
                        user_id=user_id,
                        old_value={"current_bill_amount": pc["current_bill_amount"]},
                        new_value=update_data,
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] PC Revised: {pc_id} v{new_version}")
                    
                    return {
                        "pc_id": pc_id,
                        "version": new_version,
                        "status": pc["status"],
                        **pc_values
                    }
                    
                except InvariantViolationError as e:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] PC Revision: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    # =========================================================================
    # SECTION 2 & 3: TRANSACTIONAL PAYMENT ENTRY
    # =========================================================================
    
    async def record_payment(
        self,
        pc_id: str,
        organisation_id: str,
        user_id: str,
        payment_amount: float,
        payment_date: datetime,
        payment_reference: str
    ) -> Dict[str, Any]:
        """
        Record a payment against a Payment Certificate.
        
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision.
        SECTION 3: Validates paid_value <= certified_value.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    pc = await self.db.payment_certificates.find_one(
                        {"_id": ObjectId(pc_id)},
                        session=session
                    )
                    
                    if not pc:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Payment Certificate not found"
                        )
                    
                    if pc["status"] not in ["Certified", "Partially Paid"]:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot pay against PC in status: {pc['status']}"
                        )
                    
                    # Validate positive amount
                    try:
                        validate_positive(payment_amount, 'payment_amount')
                    except NegativeValueError as e:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(e)
                        )
                    
                    # Check over-payment using Decimal precision
                    current_paid = to_decimal(pc.get("total_paid_cumulative", 0))
                    net_payable = to_decimal(pc.get("net_payable", 0))
                    new_total_paid = current_paid + to_decimal(payment_amount)
                    
                    if new_total_paid > net_payable:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Payment would exceed net_payable. Current: {to_float(current_paid)}, "
                                   f"New payment: {payment_amount}, Net payable: {to_float(net_payable)}"
                        )
                    
                    # Create payment record
                    payment_doc = {
                        "pc_id": pc_id,
                        "project_id": pc["project_id"],
                        "code_id": pc["code_id"],
                        "vendor_id": pc["vendor_id"],
                        "payment_amount": to_float(round_financial(payment_amount)),
                        "payment_date": payment_date,
                        "payment_reference": payment_reference,
                        "created_by": user_id,
                        "created_at": datetime.utcnow()
                    }
                    
                    result = await self.db.payments.insert_one(payment_doc, session=session)
                    payment_id = str(result.inserted_id)
                    
                    # Update PC status and total_paid_cumulative
                    new_status = "Fully Paid" if new_total_paid >= net_payable else "Partially Paid"
                    
                    await self.db.payment_certificates.update_one(
                        {"_id": ObjectId(pc_id)},
                        {
                            "$set": {
                                "total_paid_cumulative": to_float(round_financial(new_total_paid)),
                                "status": new_status,
                                "updated_at": datetime.utcnow()
                            }
                        },
                        session=session
                    )
                    
                    # Recalculate financials
                    await self.recalculate_financials_with_precision(
                        pc["project_id"],
                        pc["code_id"],
                        session=session
                    )
                    
                    # Validate invariants (paid_value <= certified_value)
                    await self.invariant_validator.validate_project_code_invariants(
                        pc["project_id"],
                        pc["code_id"],
                        session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=pc["project_id"],
                        module="PAYMENT",
                        entity_type="PAYMENT",
                        entity_id=payment_id,
                        action="CREATE",
                        user_id=user_id,
                        new_value={"payment_amount": payment_amount, "pc_id": pc_id},
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] Payment recorded: {payment_id} for PC {pc_id}")
                    
                    return {
                        "payment_id": payment_id,
                        "pc_id": pc_id,
                        "payment_amount": to_float(round_financial(payment_amount)),
                        "total_paid_cumulative": to_float(round_financial(new_total_paid)),
                        "pc_status": new_status
                    }
                    
                except InvariantViolationError as e:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] Payment: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    # =========================================================================
    # SECTION 2 & 3: TRANSACTIONAL RETENTION RELEASE
    # =========================================================================
    
    async def release_retention(
        self,
        organisation_id: str,
        project_id: str,
        code_id: str,
        vendor_id: str,
        user_id: str,
        release_amount: float,
        release_date: datetime
    ) -> Dict[str, Any]:
        """
        Release retained amount.
        
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision.
        SECTION 3: Validates retention_held >= 0 after release.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    # Validate positive amount
                    try:
                        validate_positive(release_amount, 'release_amount')
                    except NegativeValueError as e:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(e)
                        )
                    
                    # Get current retention held
                    state = await self.db.derived_financial_state.find_one(
                        {"project_id": project_id, "code_id": code_id},
                        session=session
                    )
                    
                    if not state:
                        # Recalculate to get current state
                        state = await self.recalculate_financials_with_precision(
                            project_id, code_id, session=session
                        )
                    
                    current_retention = to_decimal(state.get("retention_held", 0))
                    release_decimal = to_decimal(release_amount)
                    
                    # Check if release would make retention negative
                    if release_decimal > current_retention:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Release amount ({release_amount}) exceeds available retention ({to_float(current_retention)})"
                        )
                    
                    # Create retention release record
                    release_doc = {
                        "project_id": project_id,
                        "code_id": code_id,
                        "vendor_id": vendor_id,
                        "release_amount": to_float(round_financial(release_amount)),
                        "release_date": release_date,
                        "created_by": user_id,
                        "created_at": datetime.utcnow()
                    }
                    
                    result = await self.db.retention_releases.insert_one(release_doc, session=session)
                    release_id = str(result.inserted_id)
                    
                    # Recalculate financials
                    await self.recalculate_financials_with_precision(
                        project_id, code_id, session=session
                    )
                    
                    # Validate invariants (retention_held >= 0)
                    await self.invariant_validator.validate_project_code_invariants(
                        project_id, code_id, session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=project_id,
                        module="RETENTION",
                        entity_type="RETENTION_RELEASE",
                        entity_id=release_id,
                        action="CREATE",
                        user_id=user_id,
                        new_value={"release_amount": release_amount, "vendor_id": vendor_id},
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] Retention released: {release_id}")
                    
                    return {
                        "release_id": release_id,
                        "project_id": project_id,
                        "code_id": code_id,
                        "release_amount": to_float(round_financial(release_amount)),
                        "remaining_retention": to_float(safe_subtract(current_retention, release_decimal))
                    }
                    
                except InvariantViolationError as e:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] Retention release: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    # =========================================================================
    # SECTION 2: TRANSACTIONAL BUDGET MODIFICATION
    # =========================================================================
    
    async def modify_budget(
        self,
        budget_id: str,
        organisation_id: str,
        user_id: str,
        new_amount: float
    ) -> Dict[str, Any]:
        """
        Modify budget amount.
        
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision.
        SECTION 3: Validates certified_value <= new_budget.
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    budget = await self.db.project_budgets.find_one(
                        {"_id": ObjectId(budget_id)},
                        session=session
                    )
                    
                    if not budget:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Budget not found"
                        )
                    
                    # Validate non-negative
                    try:
                        validate_non_negative(new_amount, 'approved_budget_amount')
                    except NegativeValueError as e:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(e)
                        )
                    
                    # Get current certified value to check constraint
                    state = await self.db.derived_financial_state.find_one(
                        {"project_id": budget["project_id"], "code_id": budget["code_id"]},
                        session=session
                    )
                    
                    if state:
                        certified_value = to_decimal(state.get("certified_value", 0))
                        if certified_value > to_decimal(new_amount):
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"New budget ({new_amount}) cannot be less than certified_value ({to_float(certified_value)})"
                            )
                    
                    old_amount = budget["approved_budget_amount"]
                    
                    # Update budget
                    await self.db.project_budgets.update_one(
                        {"_id": ObjectId(budget_id)},
                        {
                            "$set": {
                                "approved_budget_amount": to_float(round_financial(new_amount)),
                                "updated_at": datetime.utcnow()
                            }
                        },
                        session=session
                    )
                    
                    # Recalculate financials
                    await self.recalculate_financials_with_precision(
                        budget["project_id"],
                        budget["code_id"],
                        session=session
                    )
                    
                    # Validate invariants
                    await self.invariant_validator.validate_project_code_invariants(
                        budget["project_id"],
                        budget["code_id"],
                        session=session
                    )
                    
                    # Log audit
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=budget["project_id"],
                        module="BUDGET",
                        entity_type="BUDGET",
                        entity_id=budget_id,
                        action="MODIFY",
                        user_id=user_id,
                        old_value={"approved_budget_amount": old_amount},
                        new_value={"approved_budget_amount": new_amount},
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] Budget modified: {budget_id}")
                    
                    return {
                        "budget_id": budget_id,
                        "old_amount": old_amount,
                        "new_amount": to_float(round_financial(new_amount))
                    }
                    
                except InvariantViolationError as e:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Financial invariant violation: {e.message}"
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"[TRANSACTION ERROR] Budget modification: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Transaction failed: {str(e)}"
                    )
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    async def _create_wo_version_snapshot(
        self,
        wo_id: str,
        version: int,
        session=None
    ):
        """Create immutable version snapshot of Work Order"""
        wo = await self.db.work_orders.find_one(
            {"_id": ObjectId(wo_id)},
            session=session
        )
        
        if wo:
            snapshot = {
                "wo_id": wo_id,
                "version_number": version,
                "snapshot_data": {k: v for k, v in wo.items() if k != "_id"},
                "created_at": datetime.utcnow()
            }
            await self.db.work_order_versions.insert_one(snapshot, session=session)
    
    async def _create_pc_version_snapshot(
        self,
        pc_id: str,
        version: int,
        session=None
    ):
        """Create immutable version snapshot of Payment Certificate"""
        pc = await self.db.payment_certificates.find_one(
            {"_id": ObjectId(pc_id)},
            session=session
        )
        
        if pc:
            snapshot = {
                "pc_id": pc_id,
                "version_number": version,
                "snapshot_data": {k: v for k, v in pc.items() if k != "_id"},
                "created_at": datetime.utcnow()
            }
            await self.db.payment_certificate_versions.insert_one(snapshot, session=session)
    
    async def _log_audit(
        self,
        organisation_id: str,
        project_id: Optional[str],
        module: str,
        entity_type: str,
        entity_id: str,
        action: str,
        user_id: str,
        old_value: Optional[dict] = None,
        new_value: Optional[dict] = None,
        session=None
    ):
        """Log audit event within transaction"""
        audit_doc = {
            "organisation_id": organisation_id,
            "project_id": project_id,
            "module_name": module,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action_type": action,
            "old_value_json": old_value,
            "new_value_json": new_value,
            "user_id": user_id,
            "timestamp": datetime.utcnow()
        }
        await self.db.audit_logs.insert_one(audit_doc, session=session)
    
    # =========================================================================
    # SECTION 5: INDEX CREATION
    # =========================================================================
    
    async def create_indexes(self):
        """Create all required indexes for data integrity"""
        # Duplicate invoice protection index
        await self.duplicate_protection.create_unique_constraint_index()
        
        # Document number unique indexes
        await self.document_numbering.create_unique_constraints()
        
        logger.info("All hardening indexes created")
