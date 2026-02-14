"""
PHASE 2: CORE ENGINE HARDENING - FINANCIAL INVARIANT VALIDATOR

Enforces critical financial constraints:
1. certified_value <= committed_value
2. certified_value <= approved_budget  
3. paid_value <= certified_value
4. retention_held >= 0

Blocks transactions if violated.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from decimal import Decimal
from typing import Optional, Dict, List
from datetime import datetime
from bson import Decimal128
import logging

from core.financial_precision import to_decimal, round_financial, to_float

logger = logging.getLogger(__name__)


def from_decimal128(value) -> Decimal:
    """Convert from Decimal128/float/int back to Decimal for calculations"""
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return to_decimal(value)


class InvariantViolationError(Exception):
    """Raised when a financial invariant is violated"""
    def __init__(self, violation_type: str, message: str, details: dict = None):
        self.violation_type = violation_type
        self.message = message
        self.details = details or {}
        super().__init__(message)


class FinancialInvariantValidator:
    """
    Centralized financial invariant enforcement.
    
    Used after EVERY financial mutation to ensure data integrity.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def validate_project_code_invariants(
        self,
        project_id: str,
        code_id: str,
        session=None
    ) -> bool:
        """
        Validate all financial invariants for a project/code combination.
        
        INVARIANTS:
        1. certified_value <= approved_budget
        2. paid_value <= certified_value  
        3. retention_held >= 0
        
        Raises InvariantViolationError if any constraint violated.
        Returns True if all constraints pass.
        """
        # Get current financial state
        state = await self.db.derived_financial_state.find_one(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        if not state:
            logger.warning(f"No financial state for project:{project_id}, code:{code_id}")
            return True  # No state yet, nothing to validate
        
        # Get approved budget
        budget = await self.db.project_budgets.find_one(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        if not budget:
            raise InvariantViolationError(
                violation_type="MISSING_BUDGET",
                message=f"No budget found for project:{project_id}, code:{code_id}",
                details={"project_id": project_id, "code_id": code_id}
            )
        
        approved_budget = to_decimal(budget["approved_budget_amount"])
        committed_value = to_decimal(state.get("committed_value", 0))
        certified_value = to_decimal(state.get("certified_value", 0))
        paid_value = to_decimal(state.get("paid_value", 0))
        retention_held = to_decimal(state.get("retention_held", 0))
        
        violations = []
        
        # INVARIANT 1: certified_value <= committed_value (cannot certify more than committed)
        if certified_value > committed_value and committed_value > Decimal('0'):
            violations.append({
                "type": "OVER_CERTIFICATION_VS_COMMITTED",
                "message": f"certified_value ({to_float(certified_value)}) exceeds committed_value ({to_float(committed_value)})",
                "certified_value": to_float(certified_value),
                "committed_value": to_float(committed_value)
            })
        
        # INVARIANT 2: certified_value <= approved_budget
        if certified_value > approved_budget:
            violations.append({
                "type": "OVER_CERTIFICATION",
                "message": f"certified_value ({to_float(certified_value)}) exceeds approved_budget ({to_float(approved_budget)})",
                "certified_value": to_float(certified_value),
                "approved_budget": to_float(approved_budget)
            })
        
        # INVARIANT 2: paid_value <= certified_value
        if paid_value > certified_value:
            violations.append({
                "type": "OVER_PAYMENT",
                "message": f"paid_value ({to_float(paid_value)}) exceeds certified_value ({to_float(certified_value)})",
                "paid_value": to_float(paid_value),
                "certified_value": to_float(certified_value)
            })
        
        # INVARIANT 3: retention_held >= 0
        if retention_held < Decimal('0'):
            violations.append({
                "type": "NEGATIVE_RETENTION",
                "message": f"retention_held ({to_float(retention_held)}) is negative",
                "retention_held": to_float(retention_held)
            })
        
        # If violations found, raise error with ALL violations
        if violations:
            raise InvariantViolationError(
                violation_type="MULTIPLE_VIOLATIONS" if len(violations) > 1 else violations[0]["type"],
                message="Financial invariant violation(s) detected",
                details={
                    "project_id": project_id,
                    "code_id": code_id,
                    "violations": violations
                }
            )
        
        logger.info(f"Invariants validated for project:{project_id}, code:{code_id}")
        return True
    
    async def validate_all_project_invariants(
        self,
        project_id: str,
        session=None
    ) -> Dict[str, List[dict]]:
        """
        Validate financial invariants across ALL codes in a project.
        
        Returns dict with 'valid' and 'violations' lists.
        Does NOT raise - collects all violations for reporting.
        """
        result = {
            "project_id": project_id,
            "valid": [],
            "violations": [],
            "validated_at": datetime.utcnow()
        }
        
        # Get all budgets for project
        budgets = await self.db.project_budgets.find(
            {"project_id": project_id},
            session=session
        ).to_list(length=None)
        
        for budget in budgets:
            code_id = budget["code_id"]
            try:
                await self.validate_project_code_invariants(project_id, code_id, session)
                result["valid"].append({"code_id": code_id, "status": "VALID"})
            except InvariantViolationError as e:
                result["violations"].append({
                    "code_id": code_id,
                    "status": "VIOLATION",
                    "details": e.details
                })
        
        return result
    
    async def create_violation_alert(
        self,
        project_id: str,
        code_id: str,
        violation_type: str,
        message: str,
        details: dict,
        session=None
    ):
        """
        Create an alert record for a financial invariant violation.
        Used by background validation jobs.
        """
        alert_doc = {
            "project_id": project_id,
            "code_id": code_id,
            "alert_type": violation_type,
            "severity": "CRITICAL",
            "title": f"Financial Invariant Violation: {violation_type}",
            "message": message,
            "details": details,
            "resolved": False,
            "created_at": datetime.utcnow()
        }
        
        await self.db.alerts.insert_one(alert_doc, session=session)
        logger.warning(f"Alert created: {violation_type} for project:{project_id}, code:{code_id}")
