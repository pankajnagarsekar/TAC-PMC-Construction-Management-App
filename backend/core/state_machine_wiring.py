"""
PHASE 3B: STATE MACHINE WIRING

Defines state machines for all entities and wires them into existing services.
Reuses existing side-effect logic inside transition handlers.

No new business rules.
No schema changes.

Entities:
- WorkOrder: Draft → Issued → Revised → Locked
- PaymentCertificate: Draft → Certified → PartiallyPaid → FullyPaid
- Issue: Open → InProgress → Resolved → Closed
- PettyCash: Pending → Approved → Rejected
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from datetime import datetime
from bson import ObjectId, Decimal128
from decimal import Decimal
from typing import Dict, Any, Tuple, Optional
import logging

from core.state_machine import (
    StateMachine, 
    state_machine_registry,
    InvalidTransitionError,
    GuardConditionError,
    TransitionHandlerError
)
from core.financial_precision import to_decimal, round_financial, to_float
from core.invariant_validator import FinancialInvariantValidator
from core.atomic_numbering import AtomicDocumentNumbering

logger = logging.getLogger(__name__)


# =============================================================================
# WORK ORDER STATE MACHINE
# =============================================================================

def create_work_order_state_machine(
    db: AsyncIOMotorDatabase,
    invariant_validator: FinancialInvariantValidator,
    document_numbering: AtomicDocumentNumbering,
    recalculate_fn
) -> StateMachine:
    """
    Create Work Order state machine.
    
    States: Draft → Issued → Revised → Locked
    """
    machine = StateMachine("work_order", status_field="status")
    
    # -------------------------------------------------------------------------
    # GUARD: Can issue WO
    # -------------------------------------------------------------------------
    async def guard_can_issue(entity: Dict, context: Dict) -> Tuple[bool, str]:
        """Check if WO can be issued."""
        if entity.get("locked_flag"):
            return (False, "Work Order is locked")
        if not entity.get("vendor_id"):
            return (False, "Vendor is required to issue")
        if not entity.get("base_amount") or float(entity.get("base_amount", 0)) <= 0:
            return (False, "Valid amount is required to issue")
        return (True, "")
    
    # -------------------------------------------------------------------------
    # HANDLER: Draft → Issued
    # -------------------------------------------------------------------------
    async def handle_draft_to_issued(entity: Dict, context: Dict, session) -> Dict:
        """
        Issue Work Order - existing side-effect logic.
        - Generate document number
        - Set locked_flag
        - Recalculate financials
        - Validate invariants
        """
        organisation_id = context.get("organisation_id")
        user_id = context.get("user_id")
        wo_id = str(entity["_id"])
        
        # Generate atomic document number
        doc_number, sequence = await document_numbering.generate_document_number(
            organisation_id=organisation_id,
            prefix=entity.get("prefix", "WO"),
            session=session
        )
        
        # Update document
        update_data = {
            "status": "Issued",
            "document_number": doc_number,
            "sequence_number": sequence,
            "locked_flag": True,
            "updated_at": datetime.utcnow(),
            "issued_by": user_id,
            "issued_at": datetime.utcnow()
        }
        
        await db.work_orders.update_one(
            {"_id": entity["_id"]},
            {"$set": update_data},
            session=session
        )
        
        # Recalculate financials
        await recalculate_fn(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        # Validate invariants
        await invariant_validator.validate_project_code_invariants(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] WO {wo_id}: Draft → Issued ({doc_number})")
        
        return {
            "document_number": doc_number,
            "sequence_number": sequence
        }
    
    # -------------------------------------------------------------------------
    # HANDLER: Issued → Revised
    # -------------------------------------------------------------------------
    async def handle_issued_to_revised(entity: Dict, context: Dict, session) -> Dict:
        """
        Revise Work Order - update values and recalculate.
        """
        wo_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        # Get revision values from context
        new_rate = context.get("rate")
        new_quantity = context.get("quantity")
        new_retention = context.get("retention_percentage")
        
        # Build update
        update_data = {
            "status": "Revised",
            "updated_at": datetime.utcnow(),
            "revised_by": user_id,
            "revised_at": datetime.utcnow()
        }
        
        if new_rate is not None:
            update_data["rate"] = new_rate
        if new_quantity is not None:
            update_data["quantity"] = new_quantity
        if new_retention is not None:
            update_data["retention_percentage"] = new_retention
        
        # Recalculate WO values if rate/quantity changed
        rate = new_rate if new_rate is not None else entity.get("rate", 0)
        quantity = new_quantity if new_quantity is not None else entity.get("quantity", 0)
        retention_pct = new_retention if new_retention is not None else entity.get("retention_percentage", 0)
        
        base_amount = round_financial(to_decimal(rate) * to_decimal(quantity))
        retention_amount = round_financial(base_amount * to_decimal(retention_pct) / Decimal('100'))
        net_payable = round_financial(base_amount - retention_amount)
        
        update_data["base_amount"] = Decimal128(base_amount)
        update_data["retention_amount"] = Decimal128(retention_amount)
        update_data["net_payable"] = Decimal128(net_payable)
        
        await db.work_orders.update_one(
            {"_id": entity["_id"]},
            {"$set": update_data},
            session=session
        )
        
        # Recalculate financials
        await recalculate_fn(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        # Validate invariants
        await invariant_validator.validate_project_code_invariants(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] WO {wo_id}: Issued → Revised")
        
        return {
            "base_amount": to_float(base_amount),
            "net_payable": to_float(net_payable)
        }
    
    # -------------------------------------------------------------------------
    # HANDLER: Revised → Locked
    # -------------------------------------------------------------------------
    async def handle_revised_to_locked(entity: Dict, context: Dict, session) -> Dict:
        """Lock revised WO to prevent further changes."""
        wo_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.work_orders.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Locked",
                    "locked_flag": True,
                    "locked_at": datetime.utcnow(),
                    "locked_by": user_id,
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] WO {wo_id}: Revised → Locked")
        
        return {"locked": True}
    
    # -------------------------------------------------------------------------
    # HANDLER: Issued → Locked (direct lock without revision)
    # -------------------------------------------------------------------------
    async def handle_issued_to_locked(entity: Dict, context: Dict, session) -> Dict:
        """Lock issued WO directly."""
        wo_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.work_orders.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Locked",
                    "locked_flag": True,
                    "locked_at": datetime.utcnow(),
                    "locked_by": user_id,
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] WO {wo_id}: Issued → Locked")
        
        return {"locked": True}
    
    # Register transitions
    machine.register("Draft", "Issued", handle_draft_to_issued, guard=guard_can_issue,
                    description="Issue work order with document number")
    machine.register("Issued", "Revised", handle_issued_to_revised,
                    description="Revise issued work order")
    machine.register("Revised", "Locked", handle_revised_to_locked,
                    description="Lock revised work order")
    machine.register("Issued", "Locked", handle_issued_to_locked,
                    description="Lock issued work order directly")
    
    return machine


# =============================================================================
# PAYMENT CERTIFICATE STATE MACHINE
# =============================================================================

def create_payment_certificate_state_machine(
    db: AsyncIOMotorDatabase,
    invariant_validator: FinancialInvariantValidator,
    document_numbering: AtomicDocumentNumbering,
    recalculate_fn
) -> StateMachine:
    """
    Create Payment Certificate state machine.
    
    States: Draft → Certified → PartiallyPaid → FullyPaid
    """
    machine = StateMachine("payment_certificate", status_field="status")
    
    # -------------------------------------------------------------------------
    # GUARD: Can certify PC
    # -------------------------------------------------------------------------
    async def guard_can_certify(entity: Dict, context: Dict) -> Tuple[bool, str]:
        """Check if PC can be certified."""
        if entity.get("locked_flag"):
            return (False, "Payment Certificate is locked")
        if not entity.get("wo_id"):
            return (False, "Work Order reference is required")
        amount = float(entity.get("current_bill_amount", 0))
        if amount <= 0:
            return (False, "Valid bill amount is required")
        return (True, "")
    
    # -------------------------------------------------------------------------
    # HANDLER: Draft → Certified
    # -------------------------------------------------------------------------
    async def handle_draft_to_certified(entity: Dict, context: Dict, session) -> Dict:
        """
        Certify Payment Certificate - existing side-effect logic.
        """
        organisation_id = context.get("organisation_id")
        user_id = context.get("user_id")
        pc_id = str(entity["_id"])
        
        # Generate atomic document number
        doc_number, sequence = await document_numbering.generate_document_number(
            organisation_id=organisation_id,
            prefix="PC",
            session=session
        )
        
        # Update document
        update_data = {
            "status": "Certified",
            "document_number": doc_number,
            "sequence_number": sequence,
            "locked_flag": True,
            "updated_at": datetime.utcnow(),
            "certified_by": user_id,
            "certified_at": datetime.utcnow()
        }
        
        await db.payment_certificates.update_one(
            {"_id": entity["_id"]},
            {"$set": update_data},
            session=session
        )
        
        # Recalculate financials
        await recalculate_fn(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        # Validate invariants
        await invariant_validator.validate_project_code_invariants(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] PC {pc_id}: Draft → Certified ({doc_number})")
        
        return {
            "document_number": doc_number,
            "sequence_number": sequence
        }
    
    # -------------------------------------------------------------------------
    # HANDLER: Certified → PartiallyPaid
    # -------------------------------------------------------------------------
    async def handle_certified_to_partially_paid(entity: Dict, context: Dict, session) -> Dict:
        """
        Record partial payment against PC.
        """
        pc_id = str(entity["_id"])
        payment_amount = to_decimal(context.get("payment_amount", 0))
        
        current_paid = to_decimal(entity.get("paid_amount", 0))
        new_paid = round_financial(current_paid + payment_amount)
        net_payable = to_decimal(entity.get("net_payable", 0))
        balance = round_financial(net_payable - new_paid)
        
        await db.payment_certificates.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Partially Paid",
                    "paid_amount": Decimal128(new_paid),
                    "balance_payable": Decimal128(balance),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        # Recalculate financials
        await recalculate_fn(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] PC {pc_id}: Certified → Partially Paid")
        
        return {
            "paid_amount": to_float(new_paid),
            "balance_payable": to_float(balance)
        }
    
    # -------------------------------------------------------------------------
    # HANDLER: PartiallyPaid → FullyPaid
    # -------------------------------------------------------------------------
    async def handle_partially_paid_to_fully_paid(entity: Dict, context: Dict, session) -> Dict:
        """
        Mark PC as fully paid.
        """
        pc_id = str(entity["_id"])
        payment_amount = to_decimal(context.get("payment_amount", 0))
        
        current_paid = to_decimal(entity.get("paid_amount", 0))
        new_paid = round_financial(current_paid + payment_amount)
        
        await db.payment_certificates.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Fully Paid",
                    "paid_amount": Decimal128(new_paid),
                    "balance_payable": Decimal128(Decimal('0')),
                    "fully_paid_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        # Recalculate financials
        await recalculate_fn(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] PC {pc_id}: Partially Paid → Fully Paid")
        
        return {
            "paid_amount": to_float(new_paid),
            "fully_paid": True
        }
    
    # -------------------------------------------------------------------------
    # HANDLER: Certified → FullyPaid (direct full payment)
    # -------------------------------------------------------------------------
    async def handle_certified_to_fully_paid(entity: Dict, context: Dict, session) -> Dict:
        """
        Pay PC in full directly from Certified.
        """
        pc_id = str(entity["_id"])
        net_payable = to_decimal(entity.get("net_payable", 0))
        
        await db.payment_certificates.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Fully Paid",
                    "paid_amount": Decimal128(net_payable),
                    "balance_payable": Decimal128(Decimal('0')),
                    "fully_paid_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        # Recalculate financials
        await recalculate_fn(
            entity["project_id"],
            entity["code_id"],
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] PC {pc_id}: Certified → Fully Paid")
        
        return {
            "paid_amount": to_float(net_payable),
            "fully_paid": True
        }
    
    # Register transitions
    machine.register("Draft", "Certified", handle_draft_to_certified, guard=guard_can_certify,
                    description="Certify payment certificate")
    machine.register("Certified", "Partially Paid", handle_certified_to_partially_paid,
                    description="Record partial payment")
    machine.register("Partially Paid", "Fully Paid", handle_partially_paid_to_fully_paid,
                    description="Complete payment")
    machine.register("Certified", "Fully Paid", handle_certified_to_fully_paid,
                    description="Pay in full directly")
    
    return machine


# =============================================================================
# ISSUE STATE MACHINE
# =============================================================================

def create_issue_state_machine(db: AsyncIOMotorDatabase) -> StateMachine:
    """
    Create Issue tracking state machine.
    
    States: Open → InProgress → Resolved → Closed
    """
    machine = StateMachine("issue", status_field="status")
    
    # -------------------------------------------------------------------------
    # HANDLER: Open → InProgress
    # -------------------------------------------------------------------------
    async def handle_open_to_in_progress(entity: Dict, context: Dict, session) -> Dict:
        """Start working on issue."""
        issue_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.issues.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "InProgress",
                    "assigned_to": context.get("assigned_to", user_id),
                    "started_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] Issue {issue_id}: Open → InProgress")
        
        return {"started": True}
    
    # -------------------------------------------------------------------------
    # HANDLER: InProgress → Resolved
    # -------------------------------------------------------------------------
    async def handle_in_progress_to_resolved(entity: Dict, context: Dict, session) -> Dict:
        """Mark issue as resolved."""
        issue_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.issues.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Resolved",
                    "resolution": context.get("resolution", ""),
                    "resolved_by": user_id,
                    "resolved_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] Issue {issue_id}: InProgress → Resolved")
        
        return {"resolved": True}
    
    # -------------------------------------------------------------------------
    # HANDLER: Resolved → Closed
    # -------------------------------------------------------------------------
    async def handle_resolved_to_closed(entity: Dict, context: Dict, session) -> Dict:
        """Close resolved issue."""
        issue_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.issues.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Closed",
                    "closed_by": user_id,
                    "closed_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] Issue {issue_id}: Resolved → Closed")
        
        return {"closed": True}
    
    # -------------------------------------------------------------------------
    # HANDLER: InProgress → Open (reopen)
    # -------------------------------------------------------------------------
    async def handle_in_progress_to_open(entity: Dict, context: Dict, session) -> Dict:
        """Reopen issue back to open state."""
        issue_id = str(entity["_id"])
        
        await db.issues.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Open",
                    "reopened_at": datetime.utcnow(),
                    "reopen_reason": context.get("reason", ""),
                    "updated_at": datetime.utcnow()
                },
                "$unset": {
                    "assigned_to": "",
                    "started_at": ""
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] Issue {issue_id}: InProgress → Open (reopened)")
        
        return {"reopened": True}
    
    # Register transitions
    machine.register("Open", "InProgress", handle_open_to_in_progress,
                    description="Start working on issue")
    machine.register("InProgress", "Resolved", handle_in_progress_to_resolved,
                    description="Mark issue as resolved")
    machine.register("Resolved", "Closed", handle_resolved_to_closed,
                    description="Close resolved issue")
    machine.register("InProgress", "Open", handle_in_progress_to_open,
                    description="Reopen issue")
    
    return machine


# =============================================================================
# PETTY CASH STATE MACHINE
# =============================================================================

def create_petty_cash_state_machine(db: AsyncIOMotorDatabase) -> StateMachine:
    """
    Create Petty Cash state machine.
    
    States: Pending → Approved / Rejected
    """
    machine = StateMachine("petty_cash", status_field="status")
    
    # -------------------------------------------------------------------------
    # GUARD: Can approve
    # -------------------------------------------------------------------------
    async def guard_can_approve(entity: Dict, context: Dict) -> Tuple[bool, str]:
        """Check if petty cash request can be approved."""
        amount = float(entity.get("amount", 0))
        if amount <= 0:
            return (False, "Valid amount is required")
        if not entity.get("description"):
            return (False, "Description is required")
        return (True, "")
    
    # -------------------------------------------------------------------------
    # HANDLER: Pending → Approved
    # -------------------------------------------------------------------------
    async def handle_pending_to_approved(entity: Dict, context: Dict, session) -> Dict:
        """Approve petty cash request."""
        pc_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.petty_cash.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Approved",
                    "approved_by": user_id,
                    "approved_at": datetime.utcnow(),
                    "approval_notes": context.get("notes", ""),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] PettyCash {pc_id}: Pending → Approved")
        
        return {"approved": True}
    
    # -------------------------------------------------------------------------
    # HANDLER: Pending → Rejected
    # -------------------------------------------------------------------------
    async def handle_pending_to_rejected(entity: Dict, context: Dict, session) -> Dict:
        """Reject petty cash request."""
        pc_id = str(entity["_id"])
        user_id = context.get("user_id")
        
        await db.petty_cash.update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "status": "Rejected",
                    "rejected_by": user_id,
                    "rejected_at": datetime.utcnow(),
                    "rejection_reason": context.get("reason", "Not specified"),
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"[STATE_MACHINE] PettyCash {pc_id}: Pending → Rejected")
        
        return {"rejected": True}
    
    # Register transitions
    machine.register("Pending", "Approved", handle_pending_to_approved, guard=guard_can_approve,
                    description="Approve petty cash request")
    machine.register("Pending", "Rejected", handle_pending_to_rejected,
                    description="Reject petty cash request")
    
    return machine


# =============================================================================
# STATE MACHINE FACTORY
# =============================================================================

class EntityStateMachines:
    """
    Factory for creating and accessing entity state machines.
    """
    
    def __init__(
        self,
        client: AsyncIOMotorClient,
        db: AsyncIOMotorDatabase,
        invariant_validator: FinancialInvariantValidator,
        document_numbering: AtomicDocumentNumbering,
        recalculate_fn
    ):
        self.client = client
        self.db = db
        self.invariant_validator = invariant_validator
        self.document_numbering = document_numbering
        self.recalculate_fn = recalculate_fn
        
        # Initialize state machines
        self._work_order = None
        self._payment_certificate = None
        self._issue = None
        self._petty_cash = None
    
    @property
    def work_order(self) -> StateMachine:
        """Get Work Order state machine."""
        if self._work_order is None:
            self._work_order = create_work_order_state_machine(
                self.db,
                self.invariant_validator,
                self.document_numbering,
                self.recalculate_fn
            )
        return self._work_order
    
    @property
    def payment_certificate(self) -> StateMachine:
        """Get Payment Certificate state machine."""
        if self._payment_certificate is None:
            self._payment_certificate = create_payment_certificate_state_machine(
                self.db,
                self.invariant_validator,
                self.document_numbering,
                self.recalculate_fn
            )
        return self._payment_certificate
    
    @property
    def issue(self) -> StateMachine:
        """Get Issue state machine."""
        if self._issue is None:
            self._issue = create_issue_state_machine(self.db)
        return self._issue
    
    @property
    def petty_cash(self) -> StateMachine:
        """Get Petty Cash state machine."""
        if self._petty_cash is None:
            self._petty_cash = create_petty_cash_state_machine(self.db)
        return self._petty_cash
    
    def get_all_machines(self) -> Dict[str, StateMachine]:
        """Get all state machines."""
        return {
            "work_order": self.work_order,
            "payment_certificate": self.payment_certificate,
            "issue": self.issue,
            "petty_cash": self.petty_cash
        }
    
    def get_transitions_summary(self) -> Dict[str, list]:
        """Get summary of all transitions for all entities."""
        return {
            name: machine.get_transitions()
            for name, machine in self.get_all_machines().items()
        }
