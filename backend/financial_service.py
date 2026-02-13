from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class FinancialRecalculationService:
    """
    Transaction-safe financial recalculation engine.
    
    Phase 1: All derived values are zero (no Work Orders or Payment Certificates yet)
    Phase 2+: Will calculate based on actual financial transactions
    
    RULES:
    - Must run inside MongoDB transaction
    - Recalculates all derived financial state variables
    - Atomic operation - rollback on failure
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def recalculate_project_code_financials(
        self,
        project_id: str,
        code_id: str,
        session=None
    ):
        """
        Recalculate derived financial state for a project + code combination.
        
        Phase 1 Logic:
        - committed_value = 0 (no Work Orders yet)
        - certified_value = 0 (no Payment Certificates yet)
        - paid_value = 0 (no Payments yet)
        - retention_held = 0
        - balance_budget_remaining = approved_budget_amount - committed_value
        - balance_to_pay = certified_value - paid_value
        - over_commit_flag = committed_value > approved_budget_amount
        - over_certification_flag = certified_value > committed_value
        - over_payment_flag = paid_value > certified_value
        """
        try:
            # Get approved budget
            budget = await self.db.project_budgets.find_one(
                {"project_id": project_id, "code_id": code_id},
                session=session
            )
            
            if not budget:
                logger.warning(f"No budget found for project:{project_id}, code:{code_id}")
                return
            
            approved_budget = budget["approved_budget_amount"]
            
            # Phase 1: All transaction values are zero
            committed_value = 0.0
            certified_value = 0.0
            paid_value = 0.0
            retention_held = 0.0
            
            # Calculate derived values
            balance_budget_remaining = approved_budget - committed_value
            balance_to_pay = certified_value - paid_value
            
            # Calculate flags
            over_commit_flag = committed_value > approved_budget
            over_certification_flag = certified_value > committed_value
            over_payment_flag = paid_value > certified_value
            
            # Update or create derived financial state
            state_data = {
                "project_id": project_id,
                "code_id": code_id,
                "committed_value": committed_value,
                "certified_value": certified_value,
                "paid_value": paid_value,
                "retention_held": retention_held,
                "balance_budget_remaining": balance_budget_remaining,
                "balance_to_pay": balance_to_pay,
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
            
            logger.info(f"Financial state recalculated for project:{project_id}, code:{code_id}")
            
        except Exception as e:
            logger.error(f"Financial recalculation failed: {str(e)}")
            raise
    
    async def recalculate_all_project_financials(
        self,
        project_id: str,
        session=None
    ):
        """
        Recalculate financials for all codes in a project.
        Must be called when project-level settings change (retention %, GST, etc.)
        """
        try:
            # Get all budgets for this project
            budgets = await self.db.project_budgets.find(
                {"project_id": project_id},
                session=session
            ).to_list(length=None)
            
            for budget in budgets:
                await self.recalculate_project_code_financials(
                    project_id=project_id,
                    code_id=budget["code_id"],
                    session=session
                )
            
            logger.info(f"All financial states recalculated for project:{project_id}")
            
        except Exception as e:
            logger.error(f"Project-wide financial recalculation failed: {str(e)}")
            raise
