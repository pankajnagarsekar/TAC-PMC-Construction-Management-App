from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)

class Phase2FinancialService:
    """
    Phase 2 Financial Recalculation Engine.
    
    EXTENDS Phase 1 recalculation with Work Orders, Payment Certificates,
    Payments, and Retention Releases.
    
    LOCKED FORMULAS:
    - committed_value = SUM(base_amount) from issued Work Orders
    - certified_value = SUM(current_bill_amount) from certified Payment Certificates
    - paid_value = SUM(payment_amount) from Payments
    - retention_held = retention_cumulative - released_sum
    - balance_budget_remaining = approved_budget - certified_value
    - balance_to_pay = certified_value - paid_value
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_next_sequence(
        self,
        organisation_id: str,
        prefix: str,
        session=None
    ) -> int:
        """
        Get next atomic sequence number for document numbering.
        
        ATOMIC: Uses findOneAndUpdate with $inc for thread-safety.
        """
        result = await self.db.document_sequences.find_one_and_update(
            {"organisation_id": organisation_id, "prefix": prefix},
            {
                "$inc": {"current_sequence": 1},
                "$set": {"updated_at": datetime.utcnow()}
            },
            upsert=True,
            return_document=True,  # Return updated document
            session=session
        )
        
        return result["current_sequence"]
    
    async def calculate_work_order_values(
        self,
        rate: float,
        quantity: float,
        retention_percentage: float
    ) -> dict:
        """Calculate WO derived values"""
        base_amount = rate * quantity
        retention_amount = base_amount * (retention_percentage / 100)
        net_wo_value = base_amount - retention_amount
        
        return {
            "base_amount": base_amount,
            "retention_amount": retention_amount,
            "net_wo_value": net_wo_value
        }
    
    async def calculate_payment_certificate_values(
        self,
        project_id: str,
        code_id: str,
        vendor_id: str,
        current_bill_amount: float,
        retention_percentage: float,
        cgst_percentage: float,
        sgst_percentage: float,
        session=None
    ) -> dict:
        """Calculate PC derived values"""
        
        # Get cumulative previous certified for this vendor/project/code
        previous_pcs = await self.db.payment_certificates.find(
            {
                "project_id": project_id,
                "code_id": code_id,
                "vendor_id": vendor_id,
                "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
            },
            session=session
        ).to_list(length=None)
        
        cumulative_previous_certified = sum(pc["current_bill_amount"] for pc in previous_pcs)
        total_cumulative_certified = cumulative_previous_certified + current_bill_amount
        
        # Calculate retention
        retention_current = current_bill_amount * (retention_percentage / 100)
        retention_cumulative = total_cumulative_certified * (retention_percentage / 100)
        
        # Calculate taxable and GST
        taxable_amount = current_bill_amount - retention_current
        cgst_amount = taxable_amount * (cgst_percentage / 100)
        sgst_amount = taxable_amount * (sgst_percentage / 100)
        
        # Calculate net payable
        net_payable = taxable_amount + cgst_amount + sgst_amount
        
        return {
            "cumulative_previous_certified": cumulative_previous_certified,
            "total_cumulative_certified": total_cumulative_certified,
            "retention_current": retention_current,
            "retention_cumulative": retention_cumulative,
            "taxable_amount": taxable_amount,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "net_payable": net_payable,
            "total_paid_cumulative": 0.0  # Initial value
        }
    
    async def recalculate_project_code_financials(
        self,
        project_id: str,
        code_id: str,
        session=None
    ):
        """
        Phase 2: Full financial recalculation including WO, PC, Payments, Retention.
        
        LOCKED FORMULAS:
        - committed_value = SUM(base_amount) from Issued WOs
        - certified_value = SUM(current_bill_amount) from Certified PCs
        - paid_value = SUM(payment_amount) from Payments
        - retention_held = retention_cumulative - released_sum
        - balance_budget_remaining = approved_budget - certified_value
        - balance_to_pay = certified_value - paid_value
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
            
            # Calculate committed_value from Work Orders
            wo_pipeline = [
                {
                    "$match": {
                        "project_id": project_id,
                        "code_id": code_id,
                        "status": {"$in": ["Issued", "Revised"]}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total_committed": {"$sum": "$base_amount"}
                    }
                }
            ]
            
            wo_result = await self.db.work_orders.aggregate(wo_pipeline, session=session).to_list(length=1)
            committed_value = wo_result[0]["total_committed"] if wo_result else 0.0
            
            # Calculate certified_value from Payment Certificates
            pc_pipeline = [
                {
                    "$match": {
                        "project_id": project_id,
                        "code_id": code_id,
                        "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total_certified": {"$sum": "$current_bill_amount"}
                    }
                }
            ]
            
            pc_result = await self.db.payment_certificates.aggregate(pc_pipeline, session=session).to_list(length=1)
            certified_value = pc_result[0]["total_certified"] if pc_result else 0.0
            
            # Calculate paid_value from Payments
            payment_pipeline = [
                {
                    "$match": {
                        "project_id": project_id,
                        "code_id": code_id
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total_paid": {"$sum": "$payment_amount"}
                    }
                }
            ]
            
            payment_result = await self.db.payments.aggregate(payment_pipeline, session=session).to_list(length=1)
            paid_value = payment_result[0]["total_paid"] if payment_result else 0.0
            
            # Calculate retention_held
            # Get total retention from PCs
            pc_retention_pipeline = [
                {
                    "$match": {
                        "project_id": project_id,
                        "code_id": code_id,
                        "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total_retention": {"$sum": "$retention_cumulative"}
                    }
                }
            ]
            
            pc_retention_result = await self.db.payment_certificates.aggregate(
                pc_retention_pipeline, session=session
            ).to_list(length=1)
            total_retention_cumulative = pc_retention_result[0]["total_retention"] if pc_retention_result else 0.0
            
            # Get released retention
            release_pipeline = [
                {
                    "$match": {
                        "project_id": project_id,
                        "code_id": code_id
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total_released": {"$sum": "$release_amount"}
                    }
                }
            ]
            
            release_result = await self.db.retention_releases.aggregate(release_pipeline, session=session).to_list(length=1)
            released_sum = release_result[0]["total_released"] if release_result else 0.0
            
            retention_held = total_retention_cumulative - released_sum
            
            # Calculate derived values (LOCKED FORMULAS)
            # CRITICAL: Balance_Budget_Remaining uses CERTIFIED_VALUE
            balance_budget_remaining = approved_budget - certified_value
            balance_to_pay = certified_value - paid_value
            
            # Calculate flags (LOCKED FORMULAS)
            over_commit_flag = committed_value > approved_budget  # WARNING ONLY
            over_certification_flag = certified_value > approved_budget  # CORRECTED: Compare to budget
            over_payment_flag = paid_value > certified_value
            
            # Update derived financial state
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
            logger.info(f"  committed: {committed_value}, certified: {certified_value}, paid: {paid_value}, retention_held: {retention_held}")
            
        except Exception as e:
            logger.error(f"Financial recalculation failed: {str(e)}")
            raise
    
    async def validate_financial_constraints(
        self,
        project_id: str,
        code_id: str,
        session=None
    ):
        """
        MASTER RECONCILIATION: Validate financial constraints.
        
        RULES:
        - certified_value <= approved_budget
        - paid_value <= certified_value
        - retention_held >= 0
        
        Raises HTTPException if violation detected.
        """
        # Get current financial state
        state = await self.db.derived_financial_state.find_one(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        if not state:
            # No state yet, create initial
            await self.recalculate_project_code_financials(project_id, code_id, session=session)
            state = await self.db.derived_financial_state.find_one(
                {"project_id": project_id, "code_id": code_id},
                session=session
            )
        
        # Get budget
        budget = await self.db.project_budgets.find_one(
            {"project_id": project_id, "code_id": code_id},
            session=session
        )
        
        if not budget:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No budget found for this project and code"
            )
        
        approved_budget = budget["approved_budget_amount"]
        certified_value = state["certified_value"]
        paid_value = state["paid_value"]
        retention_held = state["retention_held"]
        
        # Validate constraints
        if certified_value > approved_budget:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"CONSTRAINT VIOLATION: certified_value ({certified_value}) exceeds approved_budget ({approved_budget})"
            )
        
        if paid_value > certified_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"CONSTRAINT VIOLATION: paid_value ({paid_value}) exceeds certified_value ({certified_value})"
            )
        
        if retention_held < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"CONSTRAINT VIOLATION: retention_held ({retention_held}) is negative"
            )
        
        logger.info(f"Financial constraints validated for project:{project_id}, code:{code_id}")
        return True
