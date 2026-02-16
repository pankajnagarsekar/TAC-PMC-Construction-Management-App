"""
PHASE 6A: READ MODELS

Projection builders for read-only queries.
All reads from FinancialAggregate and base tables only.

NO writes. NO mutations. Pure query projections.

Usage:
    from core.read_models import ReadModelService
    
    service = ReadModelService(db)
    summary = await service.project_financial_summary(project_id)
    physical = await service.project_physical_summary(project_id)
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from decimal import Decimal
from bson import Decimal128
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# UTILITIES
# =============================================================================

def to_float(value) -> float:
    """Convert Decimal128/Decimal to float for JSON serialization"""
    if isinstance(value, Decimal128):
        return float(value.to_decimal())
    if isinstance(value, Decimal):
        return float(value)
    if value is None:
        return 0.0
    return float(value)


def safe_percentage(numerator: float, denominator: float) -> float:
    """Calculate percentage safely, returns 0 if denominator is 0"""
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


# =============================================================================
# READ MODEL SERVICE
# =============================================================================

class ReadModelService:
    """
    Read-only projection service.
    
    Provides pre-built queries for common read patterns.
    All methods are read-only - no mutations allowed.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    # =========================================================================
    # PROJECT FINANCIAL SUMMARY
    # =========================================================================
    
    async def project_financial_summary(self, project_id: str) -> Dict[str, Any]:
        """
        Build financial summary projection for a project.
        
        Aggregates data from:
        - financial_aggregates (canonical totals)
        - project_budgets (budget details)
        - work_orders (commitment details)
        - payment_certificates (certification details)
        
        Returns:
            Complete financial summary with totals and breakdowns
        """
        logger.debug(f"[READ_MODEL] Building financial summary for project: {project_id}")
        
        # Get all financial aggregates for project
        aggregates = await self.db.financial_aggregates.find(
            {"project_id": project_id}
        ).to_list(length=None)
        
        # Calculate totals from aggregates
        total_budget = 0.0
        total_committed = 0.0
        total_certified = 0.0
        total_paid = 0.0
        total_retention_held = 0.0
        
        code_summaries = []
        
        for agg in aggregates:
            budget = to_float(agg.get("approved_budget", 0))
            committed = to_float(agg.get("committed_value", 0))
            certified = to_float(agg.get("certified_value", 0))
            paid = to_float(agg.get("paid_value", 0))
            retention = to_float(agg.get("retention_held", 0))
            
            total_budget += budget
            total_committed += committed
            total_certified += certified
            total_paid += paid
            total_retention_held += retention
            
            code_summaries.append({
                "code_id": agg.get("code_id"),
                "approved_budget": budget,
                "committed_value": committed,
                "certified_value": certified,
                "paid_value": paid,
                "retention_held": retention,
                "budget_utilization_pct": safe_percentage(committed, budget),
                "certification_pct": safe_percentage(certified, committed),
                "payment_pct": safe_percentage(paid, certified)
            })
        
        # Get work order summary
        wo_pipeline = [
            {"$match": {"project_id": project_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_value": {"$sum": "$base_amount"}
            }}
        ]
        wo_by_status = await self.db.work_orders.aggregate(wo_pipeline).to_list(length=None)
        
        # Get payment certificate summary
        pc_pipeline = [
            {"$match": {"project_id": project_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_value": {"$sum": "$current_bill_amount"}
            }}
        ]
        pc_by_status = await self.db.payment_certificates.aggregate(pc_pipeline).to_list(length=None)
        
        # Build summary
        summary = {
            "project_id": project_id,
            "generated_at": datetime.utcnow().isoformat(),
            "totals": {
                "approved_budget": round(total_budget, 2),
                "committed_value": round(total_committed, 2),
                "certified_value": round(total_certified, 2),
                "paid_value": round(total_paid, 2),
                "retention_held": round(total_retention_held, 2),
                "remaining_budget": round(total_budget - total_committed, 2),
                "outstanding_payable": round(total_certified - total_paid, 2)
            },
            "percentages": {
                "budget_utilization": safe_percentage(total_committed, total_budget),
                "certification_progress": safe_percentage(total_certified, total_committed),
                "payment_progress": safe_percentage(total_paid, total_certified)
            },
            "by_code": code_summaries,
            "work_orders": {
                "by_status": {item["_id"]: {
                    "count": item["count"],
                    "total_value": to_float(item["total_value"])
                } for item in wo_by_status}
            },
            "payment_certificates": {
                "by_status": {item["_id"]: {
                    "count": item["count"],
                    "total_value": to_float(item["total_value"])
                } for item in pc_by_status}
            }
        }
        
        logger.debug(f"[READ_MODEL] Financial summary built for project: {project_id}")
        
        return summary
    
    # =========================================================================
    # PROJECT PHYSICAL SUMMARY
    # =========================================================================
    
    async def project_physical_summary(self, project_id: str) -> Dict[str, Any]:
        """
        Build physical progress summary projection for a project.
        
        Aggregates data from:
        - work_orders (quantities, physical work)
        - payment_certificates (measured quantities)
        - dprs (daily progress records)
        
        Returns:
            Physical progress summary with quantities and progress metrics
        """
        logger.debug(f"[READ_MODEL] Building physical summary for project: {project_id}")
        
        # Get work orders with quantities
        wo_pipeline = [
            {"$match": {"project_id": project_id, "status": {"$in": ["Issued", "Revised"]}}},
            {"$group": {
                "_id": "$code_id",
                "total_wo_quantity": {"$sum": "$quantity"},
                "wo_count": {"$sum": 1},
                "avg_rate": {"$avg": "$rate"}
            }}
        ]
        wo_by_code = await self.db.work_orders.aggregate(wo_pipeline).to_list(length=None)
        wo_lookup = {item["_id"]: item for item in wo_by_code}
        
        # Get certified quantities from payment certificates
        pc_pipeline = [
            {"$match": {
                "project_id": project_id, 
                "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
            }},
            {"$group": {
                "_id": "$code_id",
                "certified_quantity": {"$sum": "$quantity_this_bill"},
                "pc_count": {"$sum": 1}
            }}
        ]
        pc_by_code = await self.db.payment_certificates.aggregate(pc_pipeline).to_list(length=None)
        pc_lookup = {item["_id"]: item for item in pc_by_code}
        
        # Get DPR summary
        dpr_pipeline = [
            {"$match": {"project_id": project_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        dpr_by_status = await self.db.dprs.aggregate(dpr_pipeline).to_list(length=None)
        
        # Get recent DPRs
        recent_dprs = await self.db.dprs.find(
            {"project_id": project_id},
            {"_id": 1, "report_date": 1, "status": 1, "progress_notes": 1}
        ).sort("report_date", -1).limit(5).to_list(length=None)
        
        for dpr in recent_dprs:
            dpr["dpr_id"] = str(dpr.pop("_id"))
        
        # Build code-level physical progress
        all_codes = set(wo_lookup.keys()) | set(pc_lookup.keys())
        code_progress = []
        
        total_ordered_qty = 0.0
        total_certified_qty = 0.0
        
        for code_id in all_codes:
            wo_data = wo_lookup.get(code_id, {})
            pc_data = pc_lookup.get(code_id, {})
            
            ordered_qty = to_float(wo_data.get("total_wo_quantity", 0))
            certified_qty = to_float(pc_data.get("certified_quantity", 0))
            
            total_ordered_qty += ordered_qty
            total_certified_qty += certified_qty
            
            code_progress.append({
                "code_id": code_id,
                "ordered_quantity": ordered_qty,
                "certified_quantity": certified_qty,
                "remaining_quantity": round(ordered_qty - certified_qty, 2),
                "physical_progress_pct": safe_percentage(certified_qty, ordered_qty),
                "work_order_count": wo_data.get("wo_count", 0),
                "pc_count": pc_data.get("pc_count", 0),
                "average_rate": round(to_float(wo_data.get("avg_rate", 0)), 2)
            })
        
        # Sort by code_id
        code_progress.sort(key=lambda x: x["code_id"])
        
        # Build summary
        summary = {
            "project_id": project_id,
            "generated_at": datetime.utcnow().isoformat(),
            "totals": {
                "ordered_quantity": round(total_ordered_qty, 2),
                "certified_quantity": round(total_certified_qty, 2),
                "remaining_quantity": round(total_ordered_qty - total_certified_qty, 2),
                "overall_physical_progress_pct": safe_percentage(total_certified_qty, total_ordered_qty)
            },
            "by_code": code_progress,
            "dpr_summary": {
                "by_status": {item["_id"]: item["count"] for item in dpr_by_status},
                "total_dprs": sum(item["count"] for item in dpr_by_status),
                "recent_dprs": recent_dprs
            },
            "work_orders": {
                "total_count": sum(item.get("wo_count", 0) for item in wo_by_code),
                "codes_with_wos": len(wo_by_code)
            },
            "payment_certificates": {
                "total_count": sum(item.get("pc_count", 0) for item in pc_by_code),
                "codes_with_pcs": len(pc_by_code)
            }
        }
        
        logger.debug(f"[READ_MODEL] Physical summary built for project: {project_id}")
        
        return summary
    
    # =========================================================================
    # ADDITIONAL PROJECTIONS
    # =========================================================================
    
    async def vendor_summary(self, project_id: str, vendor_id: str) -> Dict[str, Any]:
        """
        Build vendor-specific summary for a project.
        
        Returns:
            Vendor's work orders, PCs, payments, and retention
        """
        # Work orders for vendor
        wo_pipeline = [
            {"$match": {"project_id": project_id, "vendor_id": vendor_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_value": {"$sum": "$base_amount"}
            }}
        ]
        wo_summary = await self.db.work_orders.aggregate(wo_pipeline).to_list(length=None)
        
        # Payment certificates for vendor
        pc_pipeline = [
            {"$match": {"project_id": project_id, "vendor_id": vendor_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_certified": {"$sum": "$current_bill_amount"},
                "total_paid": {"$sum": "$total_paid_cumulative"}
            }}
        ]
        pc_summary = await self.db.payment_certificates.aggregate(pc_pipeline).to_list(length=None)
        
        # Calculate totals
        total_committed = sum(to_float(item["total_value"]) for item in wo_summary)
        total_certified = sum(to_float(item.get("total_certified", 0)) for item in pc_summary)
        total_paid = sum(to_float(item.get("total_paid", 0)) for item in pc_summary)
        
        return {
            "project_id": project_id,
            "vendor_id": vendor_id,
            "generated_at": datetime.utcnow().isoformat(),
            "totals": {
                "committed_value": round(total_committed, 2),
                "certified_value": round(total_certified, 2),
                "paid_value": round(total_paid, 2),
                "outstanding": round(total_certified - total_paid, 2)
            },
            "work_orders": {
                "by_status": {item["_id"]: {
                    "count": item["count"],
                    "value": to_float(item["total_value"])
                } for item in wo_summary}
            },
            "payment_certificates": {
                "by_status": {item["_id"]: {
                    "count": item["count"],
                    "certified": to_float(item.get("total_certified", 0)),
                    "paid": to_float(item.get("total_paid", 0))
                } for item in pc_summary}
            }
        }
    
    async def code_detail(self, project_id: str, code_id: str) -> Dict[str, Any]:
        """
        Build detailed view for a specific activity code.
        
        Returns:
            Complete financial and physical status for the code
        """
        # Get aggregate
        aggregate = await self.db.financial_aggregates.find_one({
            "project_id": project_id,
            "code_id": code_id
        })
        
        # Get work orders
        work_orders = await self.db.work_orders.find({
            "project_id": project_id,
            "code_id": code_id
        }).sort("created_at", -1).to_list(length=None)
        
        for wo in work_orders:
            wo["wo_id"] = str(wo.pop("_id"))
        
        # Get payment certificates
        pcs = await self.db.payment_certificates.find({
            "project_id": project_id,
            "code_id": code_id
        }).sort("created_at", -1).to_list(length=None)
        
        for pc in pcs:
            pc["pc_id"] = str(pc.pop("_id"))
        
        return {
            "project_id": project_id,
            "code_id": code_id,
            "generated_at": datetime.utcnow().isoformat(),
            "aggregate": {
                "approved_budget": to_float(aggregate.get("approved_budget", 0)) if aggregate else 0,
                "committed_value": to_float(aggregate.get("committed_value", 0)) if aggregate else 0,
                "certified_value": to_float(aggregate.get("certified_value", 0)) if aggregate else 0,
                "paid_value": to_float(aggregate.get("paid_value", 0)) if aggregate else 0,
                "retention_held": to_float(aggregate.get("retention_held", 0)) if aggregate else 0,
                "version": aggregate.get("version", 0) if aggregate else 0
            },
            "work_orders": work_orders,
            "payment_certificates": pcs
        }


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def create_read_model_service(db: AsyncIOMotorDatabase) -> ReadModelService:
    """
    Factory function to create ReadModelService instance.
    
    Usage:
        from core.read_models import create_read_model_service
        read_service = create_read_model_service(db)
    """
    return ReadModelService(db)
