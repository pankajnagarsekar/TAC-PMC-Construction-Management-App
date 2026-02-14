# PHASE 2 - COMPLETE FINANCIAL ENGINE API ENDPOINTS
# All endpoints with full transaction support

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
import logging
import copy

from phase2_models import (
    WorkOrder, WorkOrderCreate, WorkOrderRevise,
    PaymentCertificate, PaymentCertificateCreate, PaymentCertificateRevise,
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
    """Create Phase 2 API router with ALL financial endpoints"""
    
    router = APIRouter(prefix="/api/phase2", tags=["Phase 2 - Financial Engine"])
    financial_service = Phase2FinancialService(db)
    
    # ============================================
    # VENDOR ENDPOINTS
    # ============================================
    
    @router.post("/vendors", status_code=status.HTTP_201_CREATED)
    async def create_vendor(vendor_data: VendorCreate, current_user: dict = Depends(get_current_user)):
        """Create vendor (Admin only)"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        existing = await db.vendors.find_one({
            "organisation_id": user["organisation_id"],
            "vendor_code": vendor_data.vendor_code
        })
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor code already exists")
        
        vendor_dict = vendor_data.dict()
        vendor_dict["organisation_id"] = user["organisation_id"]
        vendor_dict["active_status"] = True
        vendor_dict["created_at"] = datetime.utcnow()
        vendor_dict["updated_at"] = datetime.utcnow()
        
        result = await db.vendors.insert_one(vendor_dict)
        vendor_id = str(result.inserted_id)
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="VENDOR_MANAGEMENT",
            entity_type="VENDOR",
            entity_id=vendor_id,
            action_type="CREATE",
            user_id=user["user_id"],
            new_value={"vendor_name": vendor_data.vendor_name}
        )
        
        vendor_dict["vendor_id"] = vendor_id
        if "_id" in vendor_dict:
            del vendor_dict["_id"]
        return vendor_dict
    
    @router.get("/vendors")
    async def get_vendors(active_only: bool = True, current_user: dict = Depends(get_current_user)):
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
    async def create_work_order(wo_data: WorkOrderCreate, current_user: dict = Depends(get_current_user)):
        """Create Work Order in Draft status"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        await permission_checker.check_project_access(user, wo_data.project_id, require_write=True)
        
        if wo_data.rate < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rate must be >= 0")
        if wo_data.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be > 0")
        
        project = await db.projects.find_one({"_id": ObjectId(wo_data.project_id)})
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
        code = await db.code_master.find_one({"_id": ObjectId(wo_data.code_id)})
        if not code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found")
        
        vendor = await db.vendors.find_one({"_id": ObjectId(wo_data.vendor_id)})
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        
        retention_percentage = wo_data.retention_percentage if wo_data.retention_percentage is not None else project.get("project_retention_percentage", 0.0)
        
        values = await financial_service.calculate_work_order_values(wo_data.rate, wo_data.quantity, retention_percentage)
        
        wo_dict = wo_data.dict()
        wo_dict["organisation_id"] = user["organisation_id"]
        wo_dict["document_number"] = "DRAFT"
        wo_dict["sequence_number"] = 0
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
    async def issue_work_order(wo_id: str, current_user: dict = Depends(get_current_user)):
        """Issue Work Order with FULL TRANSACTION"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
        if not wo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work Order not found")
        
        if wo["status"] != "Draft":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot issue WO in status: {wo['status']}")
        
        await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
        
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    sequence = await financial_service.get_next_sequence(user["organisation_id"], wo["prefix"], session=session)
                    document_number = f"{wo['prefix']}-{sequence:06d}"
                    
                    await db.work_orders.update_one(
                        {"_id": ObjectId(wo_id)},
                        {"$set": {"document_number": document_number, "sequence_number": sequence, "status": "Issued", "updated_at": datetime.utcnow()}},
                        session=session
                    )
                    
                    await financial_service.recalculate_project_code_financials(wo["project_id"], wo["code_id"], session=session)
                    await financial_service.validate_financial_constraints(wo["project_id"], wo["code_id"], session=session)
                    
                    wo_copy = copy.deepcopy(wo)
                    wo_copy["document_number"] = document_number
                    wo_copy["sequence_number"] = sequence
                    wo_copy["status"] = "Issued"
                    if "_id" in wo_copy:
                        del wo_copy["_id"]
                    
                    await db.work_order_versions.insert_one({
                        "parent_id": wo_id,
                        "version_number": wo["version_number"],
                        "snapshot_data": wo_copy,
                        "created_at": datetime.utcnow()
                    }, session=session)
                    
                    logger.info(f"WO {wo_id} issued: {document_number}")
                    
            except Exception as e:
                logger.error(f"Failed to issue WO: {str(e)}")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to issue Work Order: {str(e)}")
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="WORK_ORDER",
            entity_type="WORK_ORDER",
            entity_id=wo_id,
            action_type="ISSUE",
            user_id=user["user_id"],
            project_id=wo["project_id"],
            old_value={"status": "Draft"},
            new_value={"status": "Issued", "document_number": document_number}
        )
        
        updated_wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
        updated_wo["wo_id"] = str(updated_wo.pop("_id"))
        return updated_wo
    
    @router.post("/work-orders/{wo_id}/revise", status_code=status.HTTP_200_OK)
    async def revise_work_order(wo_id: str, revise_data: WorkOrderRevise, current_user: dict = Depends(get_current_user)):
        """Revise Work Order with FULL RE-AGGREGATION (no delta)"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
        if not wo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work Order not found")
        
        if wo["status"] not in ["Issued", "Revised"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only revise Issued/Revised WOs")
        
        if wo.get("locked_flag", False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Work Order is locked")
        
        await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
        
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    # Create snapshot BEFORE changes
                    wo_snapshot = copy.deepcopy(wo)
                    if "_id" in wo_snapshot:
                        del wo_snapshot["_id"]
                    
                    await db.work_order_versions.insert_one({
                        "parent_id": wo_id,
                        "version_number": wo["version_number"],
                        "snapshot_data": wo_snapshot,
                        "created_at": datetime.utcnow()
                    }, session=session)
                    
                    # Apply changes
                    new_rate = revise_data.rate if revise_data.rate is not None else wo["rate"]
                    new_quantity = revise_data.quantity if revise_data.quantity is not None else wo["quantity"]
                    new_retention = revise_data.retention_percentage if revise_data.retention_percentage is not None else wo["retention_percentage"]
                    
                    values = await financial_service.calculate_work_order_values(new_rate, new_quantity, new_retention)
                    
                    update_dict = {
                        "rate": new_rate,
                        "quantity": new_quantity,
                        "retention_percentage": new_retention,
                        "base_amount": values["base_amount"],
                        "retention_amount": values["retention_amount"],
                        "net_wo_value": values["net_wo_value"],
                        "status": "Revised",
                        "version_number": wo["version_number"] + 1,
                        "updated_at": datetime.utcnow()
                    }
                    
                    await db.work_orders.update_one({"_id": ObjectId(wo_id)}, {"$set": update_dict}, session=session)
                    
                    # FULL RE-AGGREGATION (no delta logic)
                    await financial_service.recalculate_project_code_financials(wo["project_id"], wo["code_id"], session=session)
                    await financial_service.validate_financial_constraints(wo["project_id"], wo["code_id"], session=session)
                    
                    logger.info(f"WO {wo_id} revised")
                    
            except Exception as e:
                logger.error(f"Failed to revise WO: {str(e)}")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to revise Work Order: {str(e)}")
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="WORK_ORDER",
            entity_type="WORK_ORDER",
            entity_id=wo_id,
            action_type="REVISE",
            user_id=user["user_id"],
            project_id=wo["project_id"],
            old_value={"base_amount": wo["base_amount"]},
            new_value={"base_amount": values["base_amount"]}
        )
        
        updated_wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
        updated_wo["wo_id"] = str(updated_wo.pop("_id"))
        return updated_wo
    
    @router.get("/work-orders")
    async def get_work_orders(project_id: str, status: str = None, current_user: dict = Depends(get_current_user)):
        """Get Work Orders"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_project_access(user, project_id, require_write=False)
        
        query = {"project_id": project_id}
        if status:
            query["status"] = status
        
        wos = await db.work_orders.find(query).to_list(length=None)
        for wo in wos:
            wo["wo_id"] = str(wo.pop("_id"))
        
        return wos
    
    # ============================================
    # PAYMENT CERTIFICATE ENDPOINTS
    # ============================================
    
    @router.post("/payment-certificates", status_code=status.HTTP_201_CREATED)
    async def create_payment_certificate(pc_data: PaymentCertificateCreate, current_user: dict = Depends(get_current_user)):
        """Create Payment Certificate in Draft status"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        await permission_checker.check_project_access(user, pc_data.project_id, require_write=True)
        
        if pc_data.current_bill_amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current bill amount must be > 0")
        
        project = await db.projects.find_one({"_id": ObjectId(pc_data.project_id)})
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
        code = await db.code_master.find_one({"_id": ObjectId(pc_data.code_id)})
        if not code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found")
        
        vendor = await db.vendors.find_one({"_id": ObjectId(pc_data.vendor_id)})
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        
        retention_percentage = pc_data.retention_percentage if pc_data.retention_percentage is not None else project.get("project_retention_percentage", 0.0)
        cgst_percentage = project.get("project_cgst_percentage", 0.0)
        sgst_percentage = project.get("project_sgst_percentage", 0.0)
        
        values = await financial_service.calculate_payment_certificate_values(
            pc_data.project_id, pc_data.code_id, pc_data.vendor_id,
            pc_data.current_bill_amount, retention_percentage, cgst_percentage, sgst_percentage
        )
        
        pc_dict = pc_data.dict()
        pc_dict["organisation_id"] = user["organisation_id"]
        pc_dict["document_number"] = "DRAFT"
        pc_dict["sequence_number"] = 0
        pc_dict["retention_percentage"] = retention_percentage
        pc_dict["cgst_percentage"] = cgst_percentage
        pc_dict["sgst_percentage"] = sgst_percentage
        pc_dict.update(values)
        pc_dict["status"] = "Draft"
        pc_dict["locked_flag"] = False
        pc_dict["version_number"] = 1
        pc_dict["created_by"] = user["user_id"]
        pc_dict["created_at"] = datetime.utcnow()
        pc_dict["updated_at"] = datetime.utcnow()
        
        result = await db.payment_certificates.insert_one(pc_dict)
        pc_id = str(result.inserted_id)
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="PAYMENT_CERTIFICATE",
            entity_type="PAYMENT_CERTIFICATE",
            entity_id=pc_id,
            action_type="CREATE",
            user_id=user["user_id"],
            project_id=pc_data.project_id,
            new_value={"status": "Draft", "current_bill_amount": pc_data.current_bill_amount}
        )
        
        pc_dict["pc_id"] = pc_id
        if "_id" in pc_dict:
            del pc_dict["_id"]
        return pc_dict
    
    @router.post("/payment-certificates/{pc_id}/certify", status_code=status.HTTP_200_OK)
    async def certify_payment_certificate(pc_id: str, current_user: dict = Depends(get_current_user)):
        """Certify Payment Certificate with FULL TRANSACTION"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        if not pc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment Certificate not found")
        
        if pc["status"] != "Draft":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot certify PC in status: {pc['status']}")
        
        await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
        
        # Check committed_value > 0
        state = await db.derived_financial_state.find_one({"project_id": pc["project_id"], "code_id": pc["code_id"]})
        if not state or state.get("committed_value", 0) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot certify: No Work Orders issued (committed_value = 0)")
        
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    # 1. Assign sequence
                    sequence = await financial_service.get_next_sequence(user["organisation_id"], pc["prefix"], session=session)
                    document_number = f"{pc['prefix']}-{sequence:06d}"
                    
                    # 2. Update PC status
                    await db.payment_certificates.update_one(
                        {"_id": ObjectId(pc_id)},
                        {"$set": {"document_number": document_number, "sequence_number": sequence, "status": "Certified", "updated_at": datetime.utcnow()}},
                        session=session
                    )
                    
                    # 3. Recalculate financials (updates certified_value)
                    await financial_service.recalculate_project_code_financials(pc["project_id"], pc["code_id"], session=session)
                    
                    # 4. Validate constraints (checks certified_value <= approved_budget)
                    await financial_service.validate_financial_constraints(pc["project_id"], pc["code_id"], session=session)
                    
                    # 5. Create snapshot
                    pc_copy = copy.deepcopy(pc)
                    pc_copy["document_number"] = document_number
                    pc_copy["sequence_number"] = sequence
                    pc_copy["status"] = "Certified"
                    if "_id" in pc_copy:
                        del pc_copy["_id"]
                    
                    await db.payment_certificate_versions.insert_one({
                        "pc_id": pc_id,
                        "version_number": pc["version_number"],
                        "snapshot_data": pc_copy,
                        "created_at": datetime.utcnow()
                    }, session=session)
                    
                    logger.info(f"PC {pc_id} certified: {document_number}")
                    
            except Exception as e:
                logger.error(f"Failed to certify PC: {str(e)}")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to certify Payment Certificate: {str(e)}")
        
        # 6. Audit log (after commit)
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="PAYMENT_CERTIFICATE",
            entity_type="PAYMENT_CERTIFICATE",
            entity_id=pc_id,
            action_type="CERTIFY",
            user_id=user["user_id"],
            project_id=pc["project_id"],
            old_value={"status": "Draft"},
            new_value={"status": "Certified", "document_number": document_number}
        )
        
        updated_pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        updated_pc["pc_id"] = str(updated_pc.pop("_id"))
        return updated_pc
    
    @router.post("/payment-certificates/{pc_id}/revise", status_code=status.HTTP_200_OK)
    async def revise_payment_certificate(pc_id: str, revise_data: PaymentCertificateRevise, current_user: dict = Depends(get_current_user)):
        """Revise Payment Certificate with FULL RE-AGGREGATION"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        if not pc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment Certificate not found")
        
        if pc["status"] not in ["Certified"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only revise Certified PCs")
        
        if pc.get("locked_flag", False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Payment Certificate is locked")
        
        await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
        
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    # Snapshot BEFORE changes
                    pc_snapshot = copy.deepcopy(pc)
                    if "_id" in pc_snapshot:
                        del pc_snapshot["_id"]
                    
                    await db.payment_certificate_versions.insert_one({
                        "pc_id": pc_id,
                        "version_number": pc["version_number"],
                        "snapshot_data": pc_snapshot,
                        "created_at": datetime.utcnow()
                    }, session=session)
                    
                    # Apply changes
                    new_amount = revise_data.current_bill_amount if revise_data.current_bill_amount is not None else pc["current_bill_amount"]
                    new_retention = revise_data.retention_percentage if revise_data.retention_percentage is not None else pc["retention_percentage"]
                    
                    # Recalculate ALL values
                    values = await financial_service.calculate_payment_certificate_values(
                        pc["project_id"], pc["code_id"], pc["vendor_id"],
                        new_amount, new_retention, pc["cgst_percentage"], pc["sgst_percentage"], session=session
                    )
                    
                    update_dict = {
                        "current_bill_amount": new_amount,
                        "retention_percentage": new_retention,
                        **values,
                        "version_number": pc["version_number"] + 1,
                        "updated_at": datetime.utcnow()
                    }
                    
                    await db.payment_certificates.update_one({"_id": ObjectId(pc_id)}, {"$set": update_dict}, session=session)
                    
                    # FULL RE-AGGREGATION
                    await financial_service.recalculate_project_code_financials(pc["project_id"], pc["code_id"], session=session)
                    await financial_service.validate_financial_constraints(pc["project_id"], pc["code_id"], session=session)
                    
                    logger.info(f"PC {pc_id} revised")
                    
            except Exception as e:
                logger.error(f"Failed to revise PC: {str(e)}")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to revise Payment Certificate: {str(e)}")
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="PAYMENT_CERTIFICATE",
            entity_type="PAYMENT_CERTIFICATE",
            entity_id=pc_id,
            action_type="REVISE",
            user_id=user["user_id"],
            project_id=pc["project_id"],
            old_value={"current_bill_amount": pc["current_bill_amount"]},
            new_value={"current_bill_amount": new_amount}
        )
        
        updated_pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        updated_pc["pc_id"] = str(updated_pc.pop("_id"))
        return updated_pc
    
    @router.get("/payment-certificates")
    async def get_payment_certificates(project_id: str, status: str = None, current_user: dict = Depends(get_current_user)):
        """Get Payment Certificates"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_project_access(user, project_id, require_write=False)
        
        query = {"project_id": project_id}
        if status:
            query["status"] = status
        
        pcs = await db.payment_certificates.find(query).to_list(length=None)
        for pc in pcs:
            pc["pc_id"] = str(pc.pop("_id"))
        
        return pcs
    
    # ============================================
    # PAYMENT ENDPOINTS
    # ============================================
    
    @router.post("/payments", status_code=status.HTTP_201_CREATED)
    async def create_payment(payment_data: PaymentCreate, current_user: dict = Depends(get_current_user)):
        """Create Payment with FULL TRANSACTION"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        
        if payment_data.payment_amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be > 0")
        
        pc = await db.payment_certificates.find_one({"_id": ObjectId(payment_data.pc_id)})
        if not pc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment Certificate not found")
        
        if pc["status"] not in ["Certified", "Partially Paid"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only pay Certified/Partially Paid PCs")
        
        await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
        
        # Check overpayment
        new_total_paid = pc["total_paid_cumulative"] + payment_data.payment_amount
        if new_total_paid > pc["net_payable"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Overpayment: total would be {new_total_paid}, net_payable is {pc['net_payable']}")
        
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    # 1. Insert payment
                    payment_dict = payment_data.dict()
                    payment_dict["project_id"] = pc["project_id"]
                    payment_dict["code_id"] = pc["code_id"]
                    payment_dict["vendor_id"] = pc["vendor_id"]
                    payment_dict["created_at"] = datetime.utcnow()
                    
                    result = await db.payments.insert_one(payment_dict, session=session)
                    payment_id = str(result.inserted_id)
                    
                    # 2. Update PC total_paid_cumulative and status
                    new_status = "Fully Paid" if new_total_paid >= pc["net_payable"] else "Partially Paid"
                    
                    await db.payment_certificates.update_one(
                        {"_id": ObjectId(payment_data.pc_id)},
                        {"$set": {"total_paid_cumulative": new_total_paid, "status": new_status, "updated_at": datetime.utcnow()}},
                        session=session
                    )
                    
                    # 3. Recalculate financials (updates paid_value)
                    await financial_service.recalculate_project_code_financials(pc["project_id"], pc["code_id"], session=session)
                    
                    # 4. Validate constraints
                    await financial_service.validate_financial_constraints(pc["project_id"], pc["code_id"], session=session)
                    
                    logger.info(f"Payment {payment_id} created for PC {payment_data.pc_id}")
                    
            except Exception as e:
                logger.error(f"Failed to create payment: {str(e)}")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create payment: {str(e)}")
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="PAYMENT",
            entity_type="PAYMENT",
            entity_id=payment_id,
            action_type="CREATE",
            user_id=user["user_id"],
            project_id=pc["project_id"],
            new_value={"payment_amount": payment_data.payment_amount, "pc_id": payment_data.pc_id}
        )
        
        payment_dict["payment_id"] = payment_id
        return payment_dict
    
    @router.get("/payments")
    async def get_payments(pc_id: str = None, project_id: str = None, current_user: dict = Depends(get_current_user)):
        """Get Payments"""
        user = await permission_checker.get_authenticated_user(current_user)
        
        query = {}
        if pc_id:
            query["pc_id"] = pc_id
        if project_id:
            await permission_checker.check_project_access(user, project_id, require_write=False)
            query["project_id"] = project_id
        
        payments = await db.payments.find(query).to_list(length=None)
        for p in payments:
            p["payment_id"] = str(p.pop("_id"))
        
        return payments
    
    # ============================================
    # RETENTION RELEASE ENDPOINTS
    # ============================================
    
    @router.post("/retention-releases", status_code=status.HTTP_201_CREATED)
    async def create_retention_release(release_data: RetentionReleaseCreate, current_user: dict = Depends(get_current_user)):
        """Create Retention Release with FULL TRANSACTION"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_admin_role(user)
        await permission_checker.check_project_access(user, release_data.project_id, require_write=True)
        
        if release_data.release_amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Release amount must be > 0")
        
        # Verify project, code, vendor exist
        project = await db.projects.find_one({"_id": ObjectId(release_data.project_id)})
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
        code = await db.code_master.find_one({"_id": ObjectId(release_data.code_id)})
        if not code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found")
        
        vendor = await db.vendors.find_one({"_id": ObjectId(release_data.vendor_id)})
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        
        # Check current retention_held
        state = await db.derived_financial_state.find_one({"project_id": release_data.project_id, "code_id": release_data.code_id})
        if not state:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No financial state found for this project/code")
        
        if release_data.release_amount > state.get("retention_held", 0):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Release amount {release_data.release_amount} exceeds retention_held {state.get('retention_held', 0)}")
        
        async with await client.start_session() as session:
            try:
                async with session.start_transaction():
                    # 1. Insert release
                    release_dict = release_data.dict()
                    release_dict["created_at"] = datetime.utcnow()
                    
                    result = await db.retention_releases.insert_one(release_dict, session=session)
                    release_id = str(result.inserted_id)
                    
                    # 2. Recalculate financials (updates retention_held)
                    await financial_service.recalculate_project_code_financials(
                        release_data.project_id, release_data.code_id, session=session
                    )
                    
                    # 3. Validate constraints (retention_held >= 0)
                    await financial_service.validate_financial_constraints(
                        release_data.project_id, release_data.code_id, session=session
                    )
                    
                    logger.info(f"Retention release {release_id} created")
                    
            except Exception as e:
                logger.error(f"Failed to create retention release: {str(e)}")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create retention release: {str(e)}")
        
        await audit_service.log_action(
            organisation_id=user["organisation_id"],
            module_name="RETENTION_RELEASE",
            entity_type="RETENTION_RELEASE",
            entity_id=release_id,
            action_type="CREATE",
            user_id=user["user_id"],
            project_id=release_data.project_id,
            new_value={"release_amount": release_data.release_amount}
        )
        
        release_dict["release_id"] = release_id
        return release_dict
    
    @router.get("/retention-releases")
    async def get_retention_releases(project_id: str, current_user: dict = Depends(get_current_user)):
        """Get Retention Releases"""
        user = await permission_checker.get_authenticated_user(current_user)
        await permission_checker.check_project_access(user, project_id, require_write=False)
        
        releases = await db.retention_releases.find({"project_id": project_id}).to_list(length=None)
        for r in releases:
            r["release_id"] = str(r.pop("_id"))
        
        return releases
    
    return router
