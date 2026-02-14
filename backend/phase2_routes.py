# Phase 2 Financial Engine API Endpoints
#
# To integrate: Add to main server.py with:
# from phase2_routes import create_phase2_routes
# phase2_router = create_phase2_routes(client, db, audit_service, permission_checker)
# app.include_router(phase2_router)

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
import logging
import copy

from phase2_models import (
    WorkOrder, WorkOrderCreate, WorkOrderIssue, WorkOrderRevise, WorkOrderVersionSnapshot,
    PaymentCertificate, PaymentCertificateCreate, PaymentCertificateCertify, PaymentCertificateRevise,
    PaymentCertificateVersionSnapshot,
    Payment, PaymentCreate,
    RetentionRelease, RetentionReleaseCreate,
    Vendor, VendorCreate
)
from phase2_financial_service import Phase2FinancialService
from audit_service import AuditService
from permissions import PermissionChecker
from auth import get_current_user

logger = logging.getLogger(__name__)

def create_phase2_routes(
    client: AsyncIOMotorClient,
    db: AsyncIOMotorDatabase,
    audit_service: AuditService,
    permission_checker: PermissionChecker
) -> APIRouter:
    """Create Phase 2 API router with all financial endpoints"""
    
    router = APIRouter(prefix="/api/phase2", tags=["Phase 2 - Financial Engine"])
    financial_service = Phase2FinancialService(db)
    
    # ============================================
    # VENDOR ENDPOINTS
    # ============================================
    
    @router.post("/vendors", status_code=status.HTTP_201_CREATED)
    async def create_vendor(
        vendor_data: VendorCreate,
        current_user: dict = Depends(get_current_user)
    ):
        """Create vendor (Admin only)"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        # Check if vendor code already exists
        existing = await db.vendors.find_one({
            "organisation_id": user["organisation_id"],
            "vendor_code": vendor_data.vendor_code
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor code already exists"
            )
        
        vendor_dict = vendor_data.dict()
        vendor_dict["organisation_id"] = user["organisation_id"]
        vendor_dict["active_status"] = True
        vendor_dict["created_at"] = datetime.utcnow()
        vendor_dict["updated_at"] = datetime.utcnow()
        
        result = await db.vendors.insert_one(vendor_dict)
        vendor_id = str(result.inserted_id)
        
        # Audit log
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="VENDOR_MANAGEMENT",
            entity_type="VENDOR",
            entity_id=vendor_id,
            action_type="CREATE",
            user_id=user["user_id"],
            new_value={"vendor_name": vendor_data.vendor_name, "vendor_code": vendor_data.vendor_code}
        )
        
        vendor_dict["vendor_id"] = vendor_id
        if "_id" in vendor_dict:
            del vendor_dict["_id"]
        return vendor_dict
    
    @router.get("/vendors")
    async def get_vendors(
        active_only: bool = True,
        current_user: dict = Depends(get_current_user)
    ):
        """Get all vendors"""
        user = await permission_checker.get_authenticated_user(current_user)
        
        query = {"organisation_id": user["organisation_id"]}
        if active_only:
            query["active_status"] = True
        
        vendors = await db.vendors.find(query).to_list(length=None)
        
        for v in vendors:
            v["vendor_id"] = str(v.pop("_id"))
        
        return vendors
    
    # ============================================
    # WORK ORDER ENDPOINTS
    # ============================================
    
    @router.post("/work-orders", status_code=status.HTTP_201_CREATED)
    async def create_work_order(
        wo_data: WorkOrderCreate,
        current_user: dict = Depends(get_current_user)
    ):
        """
        Create Work Order in Draft status (Admin only).
        Does NOT affect committed_value until Issued.
        """
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        await permission_checker.check_project_access(user, wo_data.project_id, require_write=True)
        
        # Validate inputs
        if wo_data.rate < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rate must be >= 0"
            )
        if wo_data.quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity must be > 0"
            )
        
        # Verify project, code, vendor exist
        project = await db.projects.find_one({"_id": ObjectId(wo_data.project_id)})
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
        code = await db.code_master.find_one({"_id": ObjectId(wo_data.code_id)})
        if not code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found")
        
        vendor = await db.vendors.find_one({"_id": ObjectId(wo_data.vendor_id)})
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        
        # Get retention percentage (project override or use from WO data)
        retention_percentage = wo_data.retention_percentage
        if retention_percentage is None:
            retention_percentage = project.get("project_retention_percentage", 0.0)
        
        # Calculate WO values
        values = await financial_service.calculate_work_order_values(
            wo_data.rate,
            wo_data.quantity,
            retention_percentage
        )
        
        # Create WO in Draft status (sequence NOT assigned yet)
        wo_dict = wo_data.dict()
        wo_dict["organisation_id"] = user["organisation_id"]
        wo_dict["document_number"] = "DRAFT"  # Will be assigned on Issue
        wo_dict["sequence_number"] = 0  # Will be assigned on Issue
        wo_dict["retention_percentage"] = retention_percentage
        wo_dict.update(values)
        wo_dict["status"] = "Draft"
        wo_dict["locked_flag"] = False
        wo_dict["version_number"] = 1
        wo_dict["created_by"] = user["user_id"]
        wo_dict["created_at"] = datetime.utcnow()
        wo_dict["updated_at"] = datetime.utcnow()
        
        result = await db.work_orders.insert_one(wo_dict)
        wo_id = str(result.inserted_id)
        
        # Audit log
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="WORK_ORDER",
            entity_type="WORK_ORDER",
            entity_id=wo_id,
            action_type="CREATE",
            user_id=user["user_id"],
            project_id=wo_data.project_id,
            new_value={"status": "Draft", "base_amount": values["base_amount"]}
        )
        
        wo_dict["wo_id"] = wo_id
        if "_id" in wo_dict:
            del wo_dict["_id"]
        return wo_dict
    
    @router.post("/work-orders/{wo_id}/issue", status_code=status.HTTP_200_OK)
    async def issue_work_order(
        wo_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """
        Issue Work Order: Draft → Issued.
        
        TRANSACTION:
        1. Assign sequence number (atomic)
        2. Update WO status
        3. Update committed_value
        4. Recalculate financial state
        5. Validate constraints
        6. Create version snapshot
        7. Log audit
        
        On failure → Rollback all.
        """
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        # Get WO
        wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
        if not wo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work Order not found")
        
        if wo["status"] != "Draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot issue WO in status: {wo['status']}"
            )
        
        await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
        
        # TRANSACTION: Issue WO and update financials
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    # 1. Get next sequence number (atomic)
                    sequence = await financial_service.get_next_sequence(
                        user["organisation_id"],
                        wo["prefix"],
                        session=session
                    )
                    
                    document_number = f"{wo['prefix']}-{sequence:06d}"
                    
                    # 2. Update WO to Issued
                    await db.work_orders.update_one(
                        {"_id": ObjectId(wo_id)},
                        {
                            "$set": {
                                "document_number": document_number,
                                "sequence_number": sequence,
                                "status": "Issued",
                                "updated_at": datetime.utcnow()
                            }
                        },
                        session=session
                    )
                    
                    # 3. Recalculate financial state (updates committed_value)
                    await financial_service.recalculate_project_code_financials(
                        wo["project_id"],
                        wo["code_id"],
                        session=session
                    )
                    
                    # 4. Validate financial constraints
                    await financial_service.validate_financial_constraints(
                        wo["project_id"],
                        wo["code_id"],
                        session=session
                    )
                    
                    # 5. Create version snapshot
                    wo_copy = copy.deepcopy(wo)
                    wo_copy["wo_id"] = wo_id
                    wo_copy["document_number"] = document_number
                    wo_copy["sequence_number"] = sequence
                    wo_copy["status"] = "Issued"
                    
                    if "_id" in wo_copy:
                        del wo_copy["_id"]
                    
                    snapshot = {
                        "parent_id": wo_id,
                        "version_number": wo["version_number"],
                        "snapshot_data": wo_copy,
                        "created_at": datetime.utcnow()
                    }
                    
                    await db.work_order_versions.insert_one(snapshot, session=session)
                    
                    logger.info(f"Work Order {wo_id} issued successfully with number {document_number}")
                    
            except Exception as e:
                logger.error(f"Failed to issue WO: {str(e)}")
                # Transaction will auto-rollback
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to issue Work Order: {str(e)}"
                )
        
        # Audit log (after transaction commit)
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="WORK_ORDER",
            entity_type="WORK_ORDER",
            entity_id=wo_id,
            action_type="UPDATE",
            user_id=user["user_id"],
            project_id=wo["project_id"],
            old_value={"status": "Draft"},
            new_value={"status": "Issued", "document_number": document_number}
        )
        
        # Get updated WO
        updated_wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
        updated_wo["wo_id"] = str(updated_wo.pop("_id"))
        
        return updated_wo
    
    @router.get("/work-orders")
    async def get_work_orders(
        project_id: str,
        status: str = None,
        current_user: dict = Depends(get_current_user)
    ):
        """Get Work Orders for project"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_project_access(user, project_id, require_write=False)
        
        query = {"project_id": project_id}
        if status:
            query["status"] = status
        
        wos = await db.work_orders.find(query).to_list(length=None)
        
        for wo in wos:
            wo["wo_id"] = str(wo.pop("_id"))
        
        return wos
    
    return router
