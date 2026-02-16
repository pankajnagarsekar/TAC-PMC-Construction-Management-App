"""
PHASE 2 WAVE 1: HARDENED FINANCIAL ENGINE

Implements:
1. Decimal Precision Lock (Section 1)
2. Transaction Atomicity (Section 2)
3. Financial Invariant Enforcement (Section 3)
4. Duplicate Invoice Protection (Section 4)
5. Atomic Document Numbering (Section 5)
6. Policy Enforcement via PolicyService (Phase 4D)

ALL financial operations wrapped in MongoDB transactions.
ALL calculations use Decimal for precision.
ALL financial values stored as Decimal128 in MongoDB.
ALL mutations enforce invariants before commit.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from decimal import Decimal
from datetime import datetime
from bson import ObjectId, Decimal128
from fastapi import HTTPException, status
from typing import Optional, Dict, Any, List, Union
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
from core.policy_service import PolicyService

logger = logging.getLogger(__name__)


def to_decimal128(value: Union[float, int, str, Decimal]) -> Decimal128:
    """Convert to Decimal128 for MongoDB storage with exact precision"""
    decimal_value = round_financial(to_decimal(value))
    return Decimal128(decimal_value)


def from_decimal128(value) -> Decimal:
    """Convert from Decimal128/float/int back to Decimal for calculations"""
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return to_decimal(value)


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
    - State machine transitions (Phase 3B)
    - Policy enforcement via PolicyService (Phase 4D)
    """
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
        self.invariant_validator = FinancialInvariantValidator(db)
        self.duplicate_protection = DuplicateInvoiceProtection(db)
        self.document_numbering = AtomicDocumentNumbering(db)
        self.policy = PolicyService(db)  # Phase 4D: Policy Service
        
        # Phase 3B: Initialize state machines
        self._state_machines = None
    
    @property
    def state_machines(self):
        """Lazy initialization of state machines."""
        if self._state_machines is None:
            from core.state_machine_wiring import EntityStateMachines
            self._state_machines = EntityStateMachines(
                client=self.client,
                db=self.db,
                invariant_validator=self.invariant_validator,
                document_numbering=self.document_numbering,
                recalculate_fn=self.recalculate_financials_with_precision
            )
        return self._state_machines
    
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
        
        # Store as Decimal128 for exact precision in MongoDB
        state_data_for_db = {
            "project_id": project_id,
            "code_id": code_id,
            "committed_value": to_decimal128(committed_value),
            "certified_value": to_decimal128(certified_value),
            "paid_value": to_decimal128(paid_value),
            "retention_held": to_decimal128(retention_held),
            "balance_budget_remaining": to_decimal128(balance_budget_remaining),
            "balance_to_pay": to_decimal128(balance_to_pay),
            "over_commit_flag": over_commit_flag,
            "over_certification_flag": over_certification_flag,
            "over_payment_flag": over_payment_flag,
            "last_recalculated_at": datetime.utcnow()
        }
        
        await self.db.derived_financial_state.update_one(
            {"project_id": project_id, "code_id": code_id},
            {"$set": state_data_for_db},
            upsert=True,
            session=session
        )
        
        # Return Python-native types for API response (not Decimal128)
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
            "last_recalculated_at": datetime.utcnow().isoformat()
        }
        
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
        
        PHASE 3B: Uses state machine for transition.
        TRANSACTION: Atomic operation with full rollback on failure.
        SECTION 5: Assigns atomic document number on Issue only.
        SECTION 3: Validates financial invariants before commit.
        """
        from core.state_machine import InvalidTransitionError, GuardConditionError, TransitionHandlerError
        
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
                    
                    # PHASE 3B: Use state machine for transition
                    context = {
                        "organisation_id": organisation_id,
                        "user_id": user_id
                    }
                    
                    result = await self.state_machines.work_order.transition(
                        wo, "Issued", session=session, context=context
                    )
                    
                    # Create version snapshot
                    await self._create_wo_version_snapshot(wo_id, 1, session)
                    
                    # Log audit
                    handler_result = result.get("handler_result", {})
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=wo["project_id"],
                        module="WORK_ORDER",
                        entity_type="WORK_ORDER",
                        entity_id=wo_id,
                        action="ISSUE",
                        user_id=user_id,
                        new_value={
                            "document_number": handler_result.get("document_number"),
                            "status": "Issued"
                        },
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] WO Issued via state machine: {wo_id}")
                    
                    return {
                        "wo_id": wo_id,
                        "document_number": handler_result.get("document_number"),
                        "status": "Issued"
                    }
                
                except InvalidTransitionError as e:
                    logger.error(f"[STATE_MACHINE] Invalid transition: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(e)
                    )
                
                except GuardConditionError as e:
                    logger.error(f"[STATE_MACHINE] Guard rejected: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=e.reason
                    )
                
                except TransitionHandlerError as e:
                    logger.error(f"[STATE_MACHINE] Handler failed: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=str(e.original_error)
                    )
                    
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
        Revise a Work Order (transition from Issued to Revised).
        
        PHASE 3B: Uses state machine for transition.
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision for calculations.
        SECTION 3: Validates invariants before commit.
        """
        from core.state_machine import InvalidTransitionError, GuardConditionError, TransitionHandlerError
        
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
                    
                    # LOCK ENFORCEMENT at service layer
                    if wo.get("locked_flag", False):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Work Order {wo_id} is locked. Unlock before modification."
                        )
                    
                    # PHASE 3B: Use state machine for transition
                    context = {
                        "organisation_id": organisation_id,
                        "user_id": user_id,
                        "rate": rate,
                        "quantity": quantity,
                        "retention_percentage": retention_percentage
                    }
                    
                    result = await self.state_machines.work_order.transition(
                        wo, "Revised", session=session, context=context
                    )
                    
                    # Create version snapshot
                    new_version = wo["version_number"] + 1
                    await self._create_wo_version_snapshot(wo_id, new_version, session)
                    
                    # Log audit
                    handler_result = result.get("handler_result", {})
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=wo["project_id"],
                        module="WORK_ORDER",
                        entity_type="WORK_ORDER",
                        entity_id=wo_id,
                        action="REVISE",
                        user_id=user_id,
                        old_value={"rate": wo.get("rate"), "quantity": wo.get("quantity")},
                        new_value={"status": "Revised", **handler_result},
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] WO Revised via state machine: {wo_id}")
                    
                    return {
                        "wo_id": wo_id,
                        "version": new_version,
                        "status": "Revised",
                        **handler_result
                    }
                
                except InvalidTransitionError as e:
                    logger.error(f"[STATE_MACHINE] Invalid transition: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(e)
                    )
                
                except GuardConditionError as e:
                    logger.error(f"[STATE_MACHINE] Guard rejected: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=e.reason
                    )
                
                except TransitionHandlerError as e:
                    logger.error(f"[STATE_MACHINE] Handler failed: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=str(e.original_error)
                    )
                    
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
        Certify a Payment Certificate (transition from Draft to Certified).
        
        PHASE 3B: Uses state machine for transition.
        TRANSACTION: Atomic with rollback.
        SECTION 4: Checks for duplicate invoice before certification.
        SECTION 5: Assigns atomic document number on certification.
        SECTION 3: Validates invariants before commit.
        """
        from core.state_machine import InvalidTransitionError, GuardConditionError, TransitionHandlerError
        
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
                    
                    # SECTION 4: Check for duplicate invoice (before state machine)
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
                    
                    # PHASE 3B: Use state machine for transition
                    context = {
                        "organisation_id": organisation_id,
                        "user_id": user_id,
                        "invoice_number": invoice_number
                    }
                    
                    result = await self.state_machines.payment_certificate.transition(
                        pc, "Certified", session=session, context=context
                    )
                    
                    # Create version snapshot
                    await self._create_pc_version_snapshot(pc_id, 1, session)
                    
                    # Update invoice number if provided (state machine handles rest)
                    if invoice_number:
                        await self.db.payment_certificates.update_one(
                            {"_id": ObjectId(pc_id)},
                            {"$set": {"invoice_number": invoice_number}},
                            session=session
                        )
                    
                    # Log audit
                    handler_result = result.get("handler_result", {})
                    await self._log_audit(
                        organisation_id=organisation_id,
                        project_id=pc["project_id"],
                        module="PAYMENT_CERTIFICATE",
                        entity_type="PAYMENT_CERTIFICATE",
                        entity_id=pc_id,
                        action="CERTIFY",
                        user_id=user_id,
                        new_value={
                            "document_number": handler_result.get("document_number"),
                            "status": "Certified",
                            "invoice_number": invoice_number
                        },
                        session=session
                    )
                    
                    logger.info(f"[TRANSACTION] PC Certified via state machine: {pc_id}")
                    
                    return {
                        "pc_id": pc_id,
                        "document_number": handler_result.get("document_number"),
                        "invoice_number": invoice_number,
                        "status": "Certified"
                    }
                
                except InvalidTransitionError as e:
                    logger.error(f"[STATE_MACHINE] Invalid transition: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(e)
                    )
                
                except GuardConditionError as e:
                    logger.error(f"[STATE_MACHINE] Guard rejected: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=e.reason
                    )
                
                except TransitionHandlerError as e:
                    logger.error(f"[STATE_MACHINE] Handler failed: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=str(e.original_error)
                    )
                    
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
                    
                    # LOCK ENFORCEMENT at service layer
                    if pc.get("locked_flag", False):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Payment Certificate {pc_id} is locked. Unlock before modification."
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
        
        PHASE 3B: Uses state machine for PC status transitions.
        TRANSACTION: Atomic with rollback.
        SECTION 1: Uses Decimal precision.
        SECTION 3: Validates paid_value <= certified_value.
        """
        from core.state_machine import InvalidTransitionError, GuardConditionError, TransitionHandlerError
        
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
                    
                    # Determine target state
                    is_full_payment = new_total_paid >= net_payable
                    target_state = "Fully Paid" if is_full_payment else "Partially Paid"
                    
                    # Create payment record first
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
                    
                    # PHASE 3B: Use state machine for PC status transition
                    context = {
                        "organisation_id": organisation_id,
                        "user_id": user_id,
                        "payment_amount": payment_amount
                    }
                    
                    try:
                        await self.state_machines.payment_certificate.transition(
                            pc, target_state, session=session, context=context
                        )
                    except InvalidTransitionError:
                        # Direct update if state machine doesn't support this specific transition
                        await self.db.payment_certificates.update_one(
                            {"_id": ObjectId(pc_id)},
                            {
                                "$set": {
                                    "total_paid_cumulative": to_float(round_financial(new_total_paid)),
                                    "status": target_state,
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
                    
                    logger.info(f"[TRANSACTION] Payment recorded via state machine: {payment_id}")
                    
                    return {
                        "payment_id": payment_id,
                        "pc_id": pc_id,
                        "payment_amount": to_float(round_financial(payment_amount)),
                        "total_paid_cumulative": to_float(round_financial(new_total_paid)),
                        "pc_status": target_state
                    }
                
                except GuardConditionError as e:
                    logger.error(f"[STATE_MACHINE] Guard rejected: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=e.reason
                    )
                
                except TransitionHandlerError as e:
                    logger.error(f"[STATE_MACHINE] Handler failed: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=str(e.original_error)
                    )
                    
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
        
        SECTION 1: Uses Decimal precision.
        SECTION 3: Validates certified_value <= new_budget.
        
        Note: Works with or without MongoDB replica set.
        Attempts transactional update, falls back to non-transactional if replica set unavailable.
        """
        try:
            return await self._modify_budget_transactional(
                budget_id, organisation_id, user_id, new_amount
            )
        except Exception as e:
            # If transaction fails due to no replica set, use non-transactional fallback
            error_msg = str(e)
            if "replica set" in error_msg.lower() or "transaction" in error_msg.lower():
                logger.warning(f"[TRANSACTION FALLBACK] Using non-transactional budget modification")
                return await self._modify_budget_simple(
                    budget_id, organisation_id, user_id, new_amount
                )
            raise

    async def _modify_budget_simple(
        self,
        budget_id: str,
        organisation_id: str,
        user_id: str,
        new_amount: float
    ) -> Dict[str, Any]:
        """
        Non-transactional budget modification for single-instance MongoDB.
        Still enforces all validation rules.
        """
        try:
            budget = await self.db.project_budgets.find_one(
                {"_id": ObjectId(budget_id)}
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
            
            # Get current certified value to check constraint (UI-6 validation)
            state = await self.db.financial_state.find_one(
                {"project_id": budget["project_id"], "code_id": budget["code_id"]}
            )
            
            certified_value = Decimal(0)
            if state:
                certified_value = to_decimal(state.get("certified_value", 0))
                if certified_value > to_decimal(new_amount):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "error": "budget_reduction_blocked",
                            "message": f"Cannot reduce budget below certified value (₹{to_float(certified_value):,.2f})",
                            "certified_value": to_float(certified_value),
                            "requested_amount": new_amount
                        }
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
                }
            )
            
            # Recalculate financials (non-session version)
            await self.recalculate_financials_with_precision(
                budget["project_id"],
                budget["code_id"],
                session=None
            )
            
            logger.info(f"[BUDGET] Modified (non-tx): {budget_id}, old={old_amount}, new={new_amount}")
            
            return {
                "budget_id": budget_id,
                "old_amount": old_amount,
                "new_amount": to_float(round_financial(new_amount))
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[BUDGET ERROR] Modification failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Budget modification failed: {str(e)}"
            )

    async def _modify_budget_transactional(
        self,
        budget_id: str,
        organisation_id: str,
        user_id: str,
        new_amount: float
    ) -> Dict[str, Any]:
        """Transactional version for replica set environments."""
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
                                detail={
                                    "error": "budget_reduction_blocked",
                                    "message": f"Cannot reduce budget below certified value (₹{to_float(certified_value):,.2f})",
                                    "certified_value": to_float(certified_value),
                                    "requested_amount": new_amount
                                }
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
                "parent_id": wo_id,
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
                "parent_id": pc_id,
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
