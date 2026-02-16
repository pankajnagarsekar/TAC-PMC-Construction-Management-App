"""
PHASE 5B: FINANCIAL INTEGRITY JOB

Background job that verifies FinancialAggregate values match base tables.

For each FinancialAggregate:
1. Recalculate committed_value from work_orders
2. Recalculate certified_value from payment_certificates
3. Recalculate paid_value from payments
4. Recalculate retention values from payment_certificates
5. Compare with stored aggregate values
6. Log mismatches (NO auto-fix)

Usage:
    job = FinancialIntegrityJob(db)
    report = await job.run()
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from decimal import Decimal
from datetime import datetime
from bson import Decimal128
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# UTILITIES
# =============================================================================

def to_decimal(value) -> Decimal:
    """Convert any numeric value to Decimal"""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if value is None:
        return Decimal('0')
    return Decimal(str(value))


def round_financial(value: Decimal) -> Decimal:
    """Round to 2 decimal places"""
    return value.quantize(Decimal('0.01'))


# =============================================================================
# FINANCIAL INTEGRITY JOB
# =============================================================================

class FinancialIntegrityJob:
    """
    Background job to verify financial aggregate integrity.
    
    Compares stored aggregate values against recalculated values
    from base tables (work_orders, payment_certificates, payments).
    
    Reports mismatches but does NOT auto-fix.
    """
    
    # Tolerance for floating point comparison (0.01 = 1 cent)
    TOLERANCE = Decimal('0.01')
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.mismatches: List[Dict[str, Any]] = []
        self.checked_count = 0
        self.mismatch_count = 0
    
    async def run(self) -> Dict[str, Any]:
        """
        Run the integrity check job.
        
        Returns:
            Report with check results and any mismatches found
        """
        start_time = datetime.utcnow()
        self.mismatches = []
        self.checked_count = 0
        self.mismatch_count = 0
        
        logger.info("[INTEGRITY_JOB] Starting financial integrity check...")
        
        # Get all financial aggregates
        cursor = self.db.financial_aggregates.find({})
        
        async for aggregate in cursor:
            await self._check_aggregate(aggregate)
        
        end_time = datetime.utcnow()
        duration_ms = (end_time - start_time).total_seconds() * 1000
        
        report = {
            "job_name": "FinancialIntegrityJob",
            "status": "completed",
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "duration_ms": round(duration_ms, 2),
            "aggregates_checked": self.checked_count,
            "mismatches_found": self.mismatch_count,
            "mismatches": self.mismatches
        }
        
        if self.mismatch_count > 0:
            logger.warning(
                f"[INTEGRITY_JOB] Completed with {self.mismatch_count} mismatches "
                f"out of {self.checked_count} aggregates"
            )
        else:
            logger.info(
                f"[INTEGRITY_JOB] Completed successfully. "
                f"All {self.checked_count} aggregates verified."
            )
        
        return report
    
    async def _check_aggregate(self, aggregate: Dict[str, Any]):
        """Check a single aggregate against base tables."""
        self.checked_count += 1
        
        project_id = aggregate.get("project_id")
        code_id = aggregate.get("code_id")
        
        # Recalculate from base tables
        calculated = await self._recalculate_values(project_id, code_id)
        
        # Compare with stored values
        discrepancies = self._compare_values(aggregate, calculated)
        
        if discrepancies:
            self.mismatch_count += 1
            mismatch_record = {
                "project_id": project_id,
                "code_id": code_id,
                "aggregate_id": str(aggregate.get("_id")),
                "checked_at": datetime.utcnow().isoformat(),
                "discrepancies": discrepancies
            }
            self.mismatches.append(mismatch_record)
            
            logger.warning(
                f"[INTEGRITY_JOB] MISMATCH found: project={project_id}, code={code_id}, "
                f"discrepancies={len(discrepancies)}"
            )
            for d in discrepancies:
                logger.warning(
                    f"  - {d['field']}: stored={d['stored']}, calculated={d['calculated']}, "
                    f"diff={d['difference']}"
                )
    
    async def _recalculate_values(
        self,
        project_id: str,
        code_id: str
    ) -> Dict[str, Decimal]:
        """
        Recalculate aggregate values from base tables.
        
        Returns:
            Dict with recalculated values
        """
        # Calculate committed_value from work_orders (Issued/Revised status)
        committed_value = await self._sum_work_orders(project_id, code_id)
        
        # Calculate certified_value from payment_certificates (Certified+ status)
        certified_value = await self._sum_certified_pcs(project_id, code_id)
        
        # Calculate paid_value from payments
        paid_value = await self._sum_payments(project_id, code_id)
        
        # Calculate retention values from payment_certificates
        retention_cumulative, retention_held = await self._sum_retention(project_id, code_id)
        
        return {
            "committed_value": round_financial(committed_value),
            "certified_value": round_financial(certified_value),
            "paid_value": round_financial(paid_value),
            "retention_cumulative": round_financial(retention_cumulative),
            "retention_held": round_financial(retention_held)
        }
    
    async def _sum_work_orders(self, project_id: str, code_id: str) -> Decimal:
        """Sum base_amount from active work orders."""
        pipeline = [
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
                    "total": {"$sum": "$base_amount"}
                }
            }
        ]
        
        result = await self.db.work_orders.aggregate(pipeline).to_list(1)
        
        if result and result[0].get("total"):
            return to_decimal(result[0]["total"])
        return Decimal('0')
    
    async def _sum_certified_pcs(self, project_id: str, code_id: str) -> Decimal:
        """Sum current_bill_amount from certified payment certificates."""
        pipeline = [
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
                    "total": {"$sum": "$current_bill_amount"}
                }
            }
        ]
        
        result = await self.db.payment_certificates.aggregate(pipeline).to_list(1)
        
        if result and result[0].get("total"):
            return to_decimal(result[0]["total"])
        return Decimal('0')
    
    async def _sum_payments(self, project_id: str, code_id: str) -> Decimal:
        """Sum payment_amount from payments."""
        pipeline = [
            {
                "$match": {
                    "project_id": project_id,
                    "code_id": code_id
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$payment_amount"}
                }
            }
        ]
        
        result = await self.db.payments.aggregate(pipeline).to_list(1)
        
        if result and result[0].get("total"):
            return to_decimal(result[0]["total"])
        return Decimal('0')
    
    async def _sum_retention(
        self,
        project_id: str,
        code_id: str
    ) -> tuple[Decimal, Decimal]:
        """
        Calculate retention values.
        
        Returns:
            (retention_cumulative, retention_held)
            - retention_cumulative: Total retention deducted from all PCs
            - retention_held: Cumulative minus any releases
        """
        # Sum retention from certified PCs
        pipeline = [
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
                    "total": {"$sum": "$retention_current"}
                }
            }
        ]
        
        result = await self.db.payment_certificates.aggregate(pipeline).to_list(1)
        retention_cumulative = Decimal('0')
        if result and result[0].get("total"):
            retention_cumulative = to_decimal(result[0]["total"])
        
        # Sum retention releases
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
                    "total": {"$sum": "$release_amount"}
                }
            }
        ]
        
        release_result = await self.db.retention_releases.aggregate(release_pipeline).to_list(1)
        total_released = Decimal('0')
        if release_result and release_result[0].get("total"):
            total_released = to_decimal(release_result[0]["total"])
        
        retention_held = retention_cumulative - total_released
        
        return retention_cumulative, retention_held
    
    def _compare_values(
        self,
        aggregate: Dict[str, Any],
        calculated: Dict[str, Decimal]
    ) -> List[Dict[str, Any]]:
        """
        Compare stored aggregate values with calculated values.
        
        Returns:
            List of discrepancy records (empty if all match)
        """
        discrepancies = []
        
        fields_to_check = [
            "committed_value",
            "certified_value",
            "paid_value",
            "retention_cumulative",
            "retention_held"
        ]
        
        for field in fields_to_check:
            stored = round_financial(to_decimal(aggregate.get(field, 0)))
            calc = calculated.get(field, Decimal('0'))
            
            diff = abs(stored - calc)
            
            if diff > self.TOLERANCE:
                discrepancies.append({
                    "field": field,
                    "stored": float(stored),
                    "calculated": float(calc),
                    "difference": float(diff)
                })
        
        return discrepancies


# =============================================================================
# JOB RUNNER
# =============================================================================

async def run_integrity_check(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Convenience function to run the integrity check.
    
    Usage:
        from core.financial_integrity_job import run_integrity_check
        report = await run_integrity_check(db)
    """
    job = FinancialIntegrityJob(db)
    return await job.run()
