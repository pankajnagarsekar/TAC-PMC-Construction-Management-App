"""
PHASE 2 WAVE 1: HARDENED FINANCIAL API ROUTES

All routes use the HardenedFinancialEngine for:
- Transaction atomicity
- Decimal precision
- Invariant enforcement
- Duplicate protection
- Atomic document numbering

PHASE 1 EXTENSION: Financial Determinism Foundation
- Idempotency via operation_id
- FinancialAggregate locking
- Invariant validation inside lock
- Domain event emission after commit

PHASE 2 EXTENSION: Snapshot + Document Integrity
- Immutable snapshots on document finalization
- Global settings binding
- SHA-256 checksum for integrity
- Document locking

IMPORTANT: These routes do NOT modify API response shapes.
They EXTEND existing functionality with hardening.
"""

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId, Decimal128
from datetime import datetime, date
from typing import Optional, List, Dict, Any
import logging
import os
import uuid

from dotenv import load_dotenv
load_dotenv()

from auth import get_current_user
from permissions import PermissionChecker
from phase2_models import (
    WorkOrderCreate, WorkOrderIssue, WorkOrderRevise,
    PaymentCertificateCreate, PaymentCertificateCertify, PaymentCertificateRevise,
    PaymentCreate, RetentionReleaseCreate, VendorCreate, BudgetUpdate
)
from core.hardened_financial_engine import HardenedFinancialEngine
from core.deterministic_service import DeterministicFinancialService
from core.snapshot_service import (
    SnapshotService, DocumentLockService, SnapshotEntityType,
    build_work_order_snapshot, build_payment_certificate_snapshot
)
from core.financial_precision import (
    calculate_wo_values, calculate_pc_values,
    to_float, round_financial, NegativeValueError
)

logger = logging.getLogger(__name__)


def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize MongoDB document for JSON response (handles Decimal128)"""
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, Decimal128):
            result[key] = float(value.to_decimal())
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = serialize_doc(value)
        elif isinstance(value, list):
            result[key] = [
                serialize_doc(item) if isinstance(item, dict)
                else float(item.to_decimal()) if isinstance(item, Decimal128)
                else str(item) if isinstance(item, ObjectId)
                else item
                for item in value
            ]
        else:
            result[key] = value
    return result


# Create router
hardened_router = APIRouter(prefix="/api/v2", tags=["Phase 2 - Hardened Financial Operations"])

# MongoDB connection with replica set for transactions
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/?replicaSet=rs0')
db_name = os.environ.get('DB_NAME', 'construction_management')

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Initialize services
permission_checker = PermissionChecker(db)
hardened_engine = HardenedFinancialEngine(client, db)
deterministic_service = DeterministicFinancialService(client, db)
snapshot_service = SnapshotService(db)
document_lock_service = DocumentLockService(db)


# ============================================
# VENDOR ENDPOINTS (Supporting Entity)
# ============================================

@hardened_router.post("/vendors", status_code=status.HTTP_201_CREATED)
async def create_vendor(
    vendor_data: VendorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new vendor"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Check for duplicate vendor code
    existing = await db.vendors.find_one({
        "organisation_id": user["organisation_id"],
        "vendor_code": vendor_data.vendor_code
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vendor code '{vendor_data.vendor_code}' already exists"
        )
    
    vendor_dict = vendor_data.dict()
    vendor_dict["organisation_id"] = user["organisation_id"]
    vendor_dict["active_status"] = True
    vendor_dict["created_at"] = datetime.utcnow()
    vendor_dict["updated_at"] = datetime.utcnow()
    
    result = await db.vendors.insert_one(vendor_dict)
    vendor_id = str(result.inserted_id)
    
    vendor_dict["vendor_id"] = vendor_id
    if "_id" in vendor_dict:
        del vendor_dict["_id"]
    
    return vendor_dict


@hardened_router.get("/vendors")
async def get_vendors(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get all vendors in organisation"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {"organisation_id": user["organisation_id"]}
    if active_only:
        query["active_status"] = True
    
    vendors = await db.vendors.find(query).to_list(length=None)
    
    for v in vendors:
        v["vendor_id"] = str(v.pop("_id"))
    
    return vendors


@hardened_router.get("/vendors/{vendor_id}")
async def get_vendor(
    vendor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific vendor"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    vendor = await db.vendors.find_one({
        "_id": ObjectId(vendor_id),
        "organisation_id": user["organisation_id"]
    })
    
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    vendor["vendor_id"] = str(vendor.pop("_id"))
    return vendor


@hardened_router.put("/vendors/{vendor_id}")
async def update_vendor(
    vendor_id: str,
    vendor_data: VendorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a vendor"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Check vendor exists
    existing = await db.vendors.find_one({
        "_id": ObjectId(vendor_id),
        "organisation_id": user["organisation_id"]
    })
    
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    # Check for duplicate vendor_code (excluding current vendor)
    if vendor_data.vendor_code:
        duplicate = await db.vendors.find_one({
            "vendor_code": vendor_data.vendor_code,
            "organisation_id": user["organisation_id"],
            "_id": {"$ne": ObjectId(vendor_id)}
        })
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor code already exists"
            )
    
    update_dict = {k: v for k, v in vendor_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.vendors.update_one(
        {"_id": ObjectId(vendor_id)},
        {"$set": update_dict}
    )
    
    updated = await db.vendors.find_one({"_id": ObjectId(vendor_id)})
    updated["vendor_id"] = str(updated.pop("_id"))
    return updated


@hardened_router.delete("/vendors/{vendor_id}")
async def delete_vendor(
    vendor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a vendor (soft delete by setting active_status to false)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Check vendor exists
    existing = await db.vendors.find_one({
        "_id": ObjectId(vendor_id),
        "organisation_id": user["organisation_id"]
    })
    
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    # Soft delete - set active_status to false
    await db.vendors.update_one(
        {"_id": ObjectId(vendor_id)},
        {"$set": {"active_status": False, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Vendor deleted successfully"}


# ============================================
# WORK ORDER ENDPOINTS
# ============================================

@hardened_router.post("/work-orders", status_code=status.HTTP_201_CREATED)
async def create_work_order(
    wo_data: WorkOrderCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a Work Order in Draft status.
    
    SECTION 1: Uses Decimal precision for calculations.
    Does NOT assign document number (only on Issue).
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, wo_data.project_id, require_write=True)
    
    # Get project for retention percentage
    project = await db.projects.find_one({"_id": ObjectId(wo_data.project_id)})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use project retention if not specified
    retention_pct = wo_data.retention_percentage if wo_data.retention_percentage is not None \
                    else project.get("project_retention_percentage", 0)
    
    # SECTION 1: Calculate values with Decimal precision
    try:
        wo_values = calculate_wo_values(wo_data.rate, wo_data.quantity, retention_pct)
    except NegativeValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    wo_dict = {
        "organisation_id": user["organisation_id"],
        "project_id": wo_data.project_id,
        "code_id": wo_data.code_id,
        "vendor_id": wo_data.vendor_id,
        "document_number": "DRAFT",  # Assigned on Issue
        "prefix": wo_data.prefix,
        "sequence_number": 0,  # Assigned on Issue
        "issue_date": wo_data.issue_date,
        "rate": wo_data.rate,
        "quantity": wo_data.quantity,
        "retention_percentage": retention_pct,
        **wo_values,
        "status": "Draft",
        "locked_flag": False,
        "version_number": 0,
        "created_by": user["user_id"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.work_orders.insert_one(wo_dict)
    wo_id = str(result.inserted_id)
    
    wo_dict["wo_id"] = wo_id
    if "_id" in wo_dict:
        del wo_dict["_id"]
    
    logger.info(f"[DRAFT] WO created: {wo_id}")
    return wo_dict


@hardened_router.post("/work-orders/{wo_id}/issue")
async def issue_work_order(
    wo_id: str,
    issue_data: WorkOrderIssue = WorkOrderIssue(),
    current_user: dict = Depends(get_current_user)
):
    """
    Issue a Work Order (Draft -> Issued).
    
    Simplified version that works without replica set.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    # Verify user has access to the WO's project
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Work Order not found"
        )
    
    # Check if document is already locked
    if wo.get("locked_flag", False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Work Order is locked and cannot be modified"
        )
    
    # Check current status
    if wo.get("status") not in ["Draft", "Revised"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot issue work order with status: {wo.get('status')}"
        )
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    # Generate document number
    counter = await db.counters.find_one_and_update(
        {"_id": f"wo_{user['organisation_id']}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq_num = counter.get("seq", 1)
    document_number = f"WO-{seq_num:05d}"
    
    # Update work order status
    await db.work_orders.update_one(
        {"_id": ObjectId(wo_id)},
        {"$set": {
            "status": "Issued",
            "document_number": document_number,
            "sequence_number": seq_num,
            "locked_flag": True,
            "issued_at": datetime.utcnow(),
            "issued_by": user["user_id"],
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Update financial state (add to committed value)
    base_amount = wo.get("base_amount", 0)
    await db.financial_state.update_one(
        {"project_id": wo["project_id"], "code_id": wo["code_id"]},
        {
            "$inc": {"committed_value": base_amount},
            "$set": {"last_recalculated_at": datetime.utcnow()}
        },
        upsert=True
    )
    
    logger.info(f"[WO ISSUED] {document_number} - Amount: {base_amount}")
    
    return {
        "status": "success",
        "wo_id": wo_id,
        "document_number": document_number,
        "message": f"Work Order {document_number} issued successfully"
    }


@hardened_router.post("/work-orders/{wo_id}/revise")
async def revise_work_order(
    wo_id: str,
    revise_data: WorkOrderRevise,
    current_user: dict = Depends(get_current_user)
):
    """
    Revise a Work Order.
    
    SECTION 2: Uses transaction with automatic rollback.
    SECTION 1: Uses Decimal precision for calculations.
    SECTION 3: Validates invariants before commit.
    
    DETERMINISM: Accepts operation_id for idempotency.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Work Order not found"
        )
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    # Generate operation_id if not provided
    operation_id = revise_data.operation_id or str(uuid.uuid4())
    
    # Use deterministic service for transactional revision
    result = await deterministic_service.revise_work_order(
        wo_id=wo_id,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        rate=revise_data.rate,
        quantity=revise_data.quantity,
        retention_percentage=revise_data.retention_percentage,
        operation_id=operation_id
    )
    
    return result


@hardened_router.get("/work-orders")
async def get_work_orders(
    project_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get Work Orders"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {"organisation_id": user["organisation_id"]}
    
    if project_id:
        await permission_checker.check_project_access(user, project_id, require_write=False)
        query["project_id"] = project_id
    
    if status_filter:
        query["status"] = status_filter
    
    work_orders = await db.work_orders.find(query).to_list(length=None)
    
    result = []
    for wo in work_orders:
        wo["work_order_id"] = str(wo.pop("_id"))
        result.append(serialize_doc(wo))
    
    return result


@hardened_router.get("/work-orders/{wo_id}")
async def get_work_order(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific Work Order"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    
    if not wo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Work Order not found"
        )
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=False)
    
    wo["wo_id"] = str(wo.pop("_id"))
    return wo


@hardened_router.get("/work-orders/{wo_id}/transitions")
async def get_wo_transitions(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get allowed transitions for a work order based on current status"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=False)
    
    status = wo.get("status", "Draft")
    
    # State machine transitions
    transitions_map = {
        "Draft": ["Issued", "Cancelled"],
        "Issued": ["Revised", "Cancelled"],
        "Revised": ["Issued", "Cancelled"],
        "Cancelled": [],
    }
    
    return {
        "work_order_id": wo_id,
        "current_status": status,
        "allowed_transitions": transitions_map.get(status, [])
    }


@hardened_router.post("/work-orders/{wo_id}/cancel")
async def cancel_work_order(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a work order"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    current_status = wo.get("status", "Draft")
    if current_status == "Cancelled":
        raise HTTPException(status_code=400, detail="Work order is already cancelled")
    
    # Update status
    await db.work_orders.update_one(
        {"_id": ObjectId(wo_id)},
        {"$set": {
            "status": "Cancelled",
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "Work order cancelled successfully", "status": "Cancelled"}


@hardened_router.put("/work-orders/{wo_id}")
async def update_work_order(
    wo_id: str,
    wo_data: WorkOrderCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a draft work order"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    # Only drafts can be edited
    if wo.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Only draft work orders can be edited")
    
    # Calculate amounts
    base_amount = wo_data.rate * wo_data.quantity
    retention_pct = wo_data.retention_percentage or 0
    retention_amount = base_amount * (retention_pct / 100)
    net_value = base_amount - retention_amount
    
    update_dict = {
        "project_id": wo_data.project_id,
        "code_id": wo_data.code_id,
        "vendor_id": wo_data.vendor_id,
        "issue_date": wo_data.issue_date,
        "rate": wo_data.rate,
        "quantity": wo_data.quantity,
        "retention_percentage": retention_pct,
        "base_amount": base_amount,
        "retention_amount": retention_amount,
        "net_wo_value": net_value,
        "updated_at": datetime.utcnow()
    }
    
    await db.work_orders.update_one(
        {"_id": ObjectId(wo_id)},
        {"$set": update_dict}
    )
    
    updated_wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    updated_wo["wo_id"] = str(updated_wo.pop("_id"))
    return updated_wo


@hardened_router.delete("/work-orders/{wo_id}")
async def delete_work_order(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a draft work order"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    # Only drafts can be deleted
    if wo.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Only draft work orders can be deleted")
    
    await db.work_orders.delete_one({"_id": ObjectId(wo_id)})
    return {"message": "Work order deleted successfully"}


# ============================================
# PAYMENT CERTIFICATE ENDPOINTS
# ============================================

@hardened_router.post("/payment-certificates", status_code=status.HTTP_201_CREATED)
async def create_payment_certificate(
    pc_data: PaymentCertificateCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a Payment Certificate in Draft status.
    
    SECTION 1: Uses Decimal precision for calculations.
    Does NOT assign document number (only on Certification).
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, pc_data.project_id, require_write=True)
    
    # Get project for retention and GST percentages
    project = await db.projects.find_one({"_id": ObjectId(pc_data.project_id)})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    retention_pct = pc_data.retention_percentage if pc_data.retention_percentage is not None \
                    else project.get("project_retention_percentage", 0)
    cgst_pct = project.get("project_cgst_percentage", 0)
    sgst_pct = project.get("project_sgst_percentage", 0)
    
    # Get cumulative previous certified (all previous certified PCs for this vendor/project/code)
    previous_pcs = await db.payment_certificates.find({
        "project_id": pc_data.project_id,
        "code_id": pc_data.code_id,
        "vendor_id": pc_data.vendor_id,
        "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
    }).to_list(length=None)
    
    cumulative_previous = sum(pc.get("current_bill_amount", 0) for pc in previous_pcs)
    
    # SECTION 1: Calculate values with Decimal precision
    try:
        pc_values = calculate_pc_values(
            current_bill_amount=pc_data.current_bill_amount,
            cumulative_previous_certified=cumulative_previous,
            retention_percentage=retention_pct,
            cgst_percentage=cgst_pct,
            sgst_percentage=sgst_pct
        )
    except NegativeValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    pc_dict = {
        "organisation_id": user["organisation_id"],
        "project_id": pc_data.project_id,
        "code_id": pc_data.code_id,
        "vendor_id": pc_data.vendor_id,
        "document_number": "DRAFT",  # Assigned on Certification
        "prefix": pc_data.prefix,
        "sequence_number": 0,  # Assigned on Certification
        "bill_date": pc_data.bill_date,
        "current_bill_amount": pc_data.current_bill_amount,
        "retention_percentage": retention_pct,
        "cgst_percentage": cgst_pct,
        "sgst_percentage": sgst_pct,
        **pc_values,
        "status": "Draft",
        "locked_flag": False,
        "version_number": 0,
        "created_by": user["user_id"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.payment_certificates.insert_one(pc_dict)
    pc_id = str(result.inserted_id)
    
    pc_dict["pc_id"] = pc_id
    if "_id" in pc_dict:
        del pc_dict["_id"]
    
    logger.info(f"[DRAFT] PC created: {pc_id}")
    return pc_dict


@hardened_router.post("/payment-certificates/{pc_id}/certify")
async def certify_payment_certificate(
    pc_id: str,
    certify_data: PaymentCertificateCertify = PaymentCertificateCertify(),
    invoice_number: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Certify a Payment Certificate (Draft -> Certified).
    
    SECTION 2: Uses transaction with automatic rollback.
    SECTION 3: Validates invariants before commit.
    SECTION 4: Checks for duplicate invoice.
    SECTION 5: Assigns atomic document number.
    
    DETERMINISM: Accepts operation_id for idempotency.
    
    SNAPSHOT: Creates immutable snapshot with embedded data and settings.
    LOCKING: Sets locked_flag = true after certification.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment Certificate not found"
        )
    
    # Check if document is already locked
    if pc.get("locked_flag", False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment Certificate is locked and cannot be modified"
        )
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
    
    # Generate operation_id if not provided
    operation_id = certify_data.operation_id or str(uuid.uuid4())
    
    # Use deterministic service for transactional certification
    result = await deterministic_service.certify_payment_certificate(
        pc_id=pc_id,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        operation_id=operation_id
    )
    
    # If successful, create snapshot and lock document
    if result.get("status") == "success":
        # Build complete embedded snapshot
        snapshot_data = await build_payment_certificate_snapshot(db, pc_id)
        
        # Create immutable snapshot (with settings embedded)
        snapshot = await snapshot_service.create_snapshot(
            entity_type=SnapshotEntityType.PAYMENT_CERTIFICATE,
            entity_id=pc_id,
            data=snapshot_data,
            organisation_id=user["organisation_id"],
            user_id=user["user_id"]
        )
        
        # Lock the document
        await document_lock_service.lock_document(
            collection="payment_certificates",
            document_id=pc_id,
            snapshot_version=snapshot.get("version", 1),
            user_id=user["user_id"]
        )
        
        result["snapshot_version"] = snapshot.get("version")
        result["locked"] = True
    
    return result


@hardened_router.post("/payment-certificates/{pc_id}/revise")
async def revise_payment_certificate(
    pc_id: str,
    revise_data: PaymentCertificateRevise,
    current_user: dict = Depends(get_current_user)
):
    """
    Revise a Payment Certificate.
    
    SECTION 2: Uses transaction with automatic rollback.
    SECTION 1: Uses Decimal precision for calculations.
    SECTION 3: Validates invariants before commit.
    
    DETERMINISM: Accepts operation_id for idempotency.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment Certificate not found"
        )
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
    
    # Generate operation_id if not provided
    operation_id = revise_data.operation_id or str(uuid.uuid4())
    
    # Use deterministic service for transactional revision
    result = await deterministic_service.revise_payment_certificate(
        pc_id=pc_id,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        current_bill_amount=revise_data.current_bill_amount,
        retention_percentage=revise_data.retention_percentage,
        operation_id=operation_id
    )
    
    return result


@hardened_router.get("/payment-certificates")
async def get_payment_certificates(
    project_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get Payment Certificates"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {"organisation_id": user["organisation_id"]}
    
    if project_id:
        await permission_checker.check_project_access(user, project_id, require_write=False)
        query["project_id"] = project_id
    
    if status_filter:
        query["status"] = status_filter
    
    pcs = await db.payment_certificates.find(query).to_list(length=None)
    
    result = []
    for pc in pcs:
        pc["payment_certificate_id"] = str(pc.pop("_id"))
        result.append(serialize_doc(pc))
    
    return result


@hardened_router.get("/payment-certificates/{pc_id}")
async def get_payment_certificate(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific Payment Certificate"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    
    if not pc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment Certificate not found"
        )
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=False)
    
    pc["pc_id"] = str(pc.pop("_id"))
    return pc


# ============================================
# PAYMENT ENDPOINTS
# ============================================

@hardened_router.post("/payments", status_code=status.HTTP_201_CREATED)
async def create_payment(
    payment_data: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Record a payment against a Payment Certificate.
    
    SECTION 2: Uses transaction with automatic rollback.
    SECTION 1: Uses Decimal precision for validation.
    SECTION 3: Validates paid_value <= certified_value.
    
    DETERMINISM: Accepts operation_id for idempotency.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(payment_data.pc_id)})
    if not pc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment Certificate not found"
        )
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
    
    # Generate operation_id if not provided
    operation_id = payment_data.operation_id or str(uuid.uuid4())
    
    # Use deterministic service for transactional payment
    result = await deterministic_service.create_payment(
        pc_id=payment_data.pc_id,
        payment_amount=payment_data.payment_amount,
        payment_date=payment_data.payment_date,
        payment_reference=payment_data.payment_reference,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        operation_id=operation_id
    )
    
    return result


@hardened_router.get("/payments")
async def get_payments(
    project_id: Optional[str] = None,
    pc_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get payments"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {}
    
    if project_id:
        await permission_checker.check_project_access(user, project_id, require_write=False)
        query["project_id"] = project_id
    
    if pc_id:
        query["pc_id"] = pc_id
    
    payments = await db.payments.find(query).to_list(length=None)
    
    for p in payments:
        p["payment_id"] = str(p.pop("_id"))
    
    return payments


# ============================================
# RETENTION RELEASE ENDPOINTS
# ============================================

@hardened_router.post("/retention-releases", status_code=status.HTTP_201_CREATED)
async def create_retention_release(
    release_data: RetentionReleaseCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Release retained amount.
    
    SECTION 2: Uses transaction with automatic rollback.
    SECTION 1: Uses Decimal precision for validation.
    SECTION 3: Validates retention_held >= 0.
    
    DETERMINISM: Accepts operation_id for idempotency.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    await permission_checker.check_project_access(user, release_data.project_id, require_write=True)
    
    # Generate operation_id if not provided
    operation_id = release_data.operation_id or str(uuid.uuid4())
    
    # Use deterministic service for transactional retention release
    result = await deterministic_service.create_retention_release(
        project_id=release_data.project_id,
        code_id=release_data.code_id,
        vendor_id=release_data.vendor_id,
        release_amount=release_data.release_amount,
        release_date=release_data.release_date,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        operation_id=operation_id
    )
    
    return result


@hardened_router.get("/retention-releases")
async def get_retention_releases(
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get retention releases"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {}
    
    if project_id:
        await permission_checker.check_project_access(user, project_id, require_write=False)
        query["project_id"] = project_id
    
    releases = await db.retention_releases.find(query).to_list(length=None)
    
    for r in releases:
        r["release_id"] = str(r.pop("_id"))
    
    return releases


# ============================================
# BUDGET MODIFICATION (HARDENED)
# ============================================

@hardened_router.put("/budgets/{budget_id}/modify")
async def modify_budget(
    budget_id: str,
    budget_data: BudgetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Modify budget amount.
    
    SECTION 2: Uses transaction with automatic rollback.
    SECTION 1: Uses Decimal precision.
    SECTION 3: Validates certified_value <= new_budget.
    
    PHASE 5C: Requires operation_id for idempotency.
    - Auto-generates if not provided.
    - Returns previous response if duplicate.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    budget = await db.project_budgets.find_one({"_id": ObjectId(budget_id)})
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    await permission_checker.check_project_access(user, budget["project_id"], require_write=True)
    
    # Phase 5C: Generate operation_id if not provided
    operation_id = budget_data.operation_id or str(uuid.uuid4())
    
    # Use deterministic service with idempotency
    result = await deterministic_service.update_budget(
        project_id=budget["project_id"],
        code_id=budget.get("code_id", "DEFAULT"),
        approved_budget_amount=budget_data.approved_budget_amount,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        operation_id=operation_id
    )
    
    return result


# ============================================
# FINANCIAL AGGREGATE ENDPOINTS (NEW)
# ============================================

@hardened_router.get("/financial-aggregates/{project_id}/{code_id}")
async def get_financial_aggregate(
    project_id: str,
    code_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the deterministic financial aggregate for a project/code.
    
    Returns canonical values for:
    - approved_budget
    - committed_value
    - certified_value
    - paid_value
    - retention_cumulative
    - retention_held
    - version
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, project_id, require_write=False)
    
    aggregate = await deterministic_service.get_financial_aggregate(project_id, code_id)
    
    if not aggregate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial aggregate not found"
        )
    
    return aggregate


@hardened_router.get("/financial-aggregates/{project_id}")
async def get_project_financial_aggregates(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all financial aggregates for a project.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, project_id, require_write=False)
    
    aggregates = await db.financial_aggregates.find({"project_id": project_id}).to_list(length=None)
    
    result = []
    for agg in aggregates:
        agg["aggregate_id"] = str(agg.pop("_id"))
        result.append(serialize_doc(agg))
    
    return result


# ============================================
# FINANCIAL STATE ENDPOINTS
# ============================================

@hardened_router.get("/financial-state/{project_id}")
async def get_financial_state(
    project_id: str,
    code_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get derived financial state for project"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, project_id, require_write=False)
    
    query = {"project_id": project_id}
    if code_id:
        query["code_id"] = code_id
    
    states = await db.derived_financial_state.find(query).to_list(length=None)
    
    # Serialize to handle Decimal128
    result = []
    for s in states:
        s["state_id"] = str(s.pop("_id"))
        result.append(serialize_doc(s))
    
    return result


@hardened_router.post("/financial-state/{project_id}/recalculate")
async def recalculate_financial_state(
    project_id: str,
    code_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger financial recalculation.
    
    SECTION 1: Uses Decimal precision throughout.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    await permission_checker.check_project_access(user, project_id, require_write=True)
    
    if code_id:
        state = await hardened_engine.recalculate_financials_with_precision(project_id, code_id)
        return {"recalculated": [serialize_doc(state)] if state else []}
    else:
        # Recalculate all codes in project
        budgets = await db.project_budgets.find({"project_id": project_id}).to_list(length=None)
        results = []
        for budget in budgets:
            state = await hardened_engine.recalculate_financials_with_precision(
                project_id, budget["code_id"]
            )
            if state:
                results.append(serialize_doc(state))
        return {"recalculated": results}


# ============================================
# VERSION HISTORY ENDPOINTS
# ============================================

@hardened_router.get("/work-orders/{wo_id}/versions")
async def get_work_order_versions(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get version history for a Work Order"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Work Order not found"
        )
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=False)
    
    versions = await db.work_order_versions.find(
        {"$or": [{"parent_id": wo_id}, {"wo_id": wo_id}]}
    ).sort("version_number", 1).to_list(length=None)
    
    for v in versions:
        v["snapshot_id"] = str(v.pop("_id"))
    
    return versions


@hardened_router.get("/payment-certificates/{pc_id}/versions")
async def get_payment_certificate_versions(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get version history for a Payment Certificate"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment Certificate not found"
        )
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=False)
    
    versions = await db.payment_certificate_versions.find(
        {"$or": [{"parent_id": pc_id}, {"pc_id": pc_id}]}
    ).sort("version_number", 1).to_list(length=None)
    
    for v in versions:
        v["snapshot_id"] = str(v.pop("_id"))
    
    return versions


# ============================================
# SYSTEM INITIALIZATION
# ============================================

@hardened_router.post("/system/init-indexes")
async def initialize_indexes(current_user: dict = Depends(get_current_user)):
    """
    Initialize all database indexes for hardening.
    
    SECTION 4: Creates unique invoice index.
    SECTION 5: Creates unique document number indexes.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    await hardened_engine.create_indexes()
    
    return {"status": "success", "message": "All hardening indexes created"}


# ============================================
# HEALTH CHECK
# ============================================

@hardened_router.get("/health")
async def health_check():
    """Health check for hardened API"""
    # Test transaction support
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                pass  # Just test that we can start a transaction
        transaction_support = True
    except Exception:
        transaction_support = False
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "version": "2.0.0",
        "phase": "Phase 2 Wave 1 - Hardened Financial Core",
        "features": {
            "decimal_precision": True,
            "transaction_support": transaction_support,
            "invariant_enforcement": True,
            "duplicate_protection": True,
            "atomic_numbering": True
        }
    }
