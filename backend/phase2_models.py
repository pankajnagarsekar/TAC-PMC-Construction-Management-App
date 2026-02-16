from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId

# ============================================
# PHASE 2: FINANCIAL ENGINE EXTENSIONS
# ============================================

# ============================================
# WORK ORDER MODELS
# ============================================
class WorkOrder(BaseModel):
    wo_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    project_id: str
    code_id: str
    vendor_id: str
    document_number: str  # Generated: PREFIX-SEQUENCE
    prefix: str
    sequence_number: int  # Global atomic counter
    issue_date: datetime
    rate: float  # Must be >= 0
    quantity: float  # Must be > 0
    base_amount: float  # Calculated: rate * quantity
    retention_percentage: float  # Project override else global
    retention_amount: float  # Calculated: base_amount * (retention% / 100)
    net_wo_value: float  # Calculated: base_amount - retention_amount
    status: str  # Draft, Issued, Revised
    locked_flag: bool = False
    version_number: int = 1
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class WorkOrderCreate(BaseModel):
    project_id: str
    code_id: str
    vendor_id: str
    prefix: str = "WO"
    issue_date: datetime
    rate: float
    quantity: float
    retention_percentage: Optional[float] = None  # If None, use project default

class WorkOrderIssue(BaseModel):
    operation_id: Optional[str] = None  # UUID for idempotency - auto-generated if not provided

class WorkOrderRevise(BaseModel):
    operation_id: Optional[str] = None  # UUID for idempotency - auto-generated if not provided
    rate: Optional[float] = None
    quantity: Optional[float] = None
    retention_percentage: Optional[float] = None

class WorkOrderVersionSnapshot(BaseModel):
    snapshot_id: Optional[str] = Field(default=None, alias="_id")
    wo_id: str
    version_number: int
    snapshot_data: dict  # Full WO state at version
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============================================
# PAYMENT CERTIFICATE MODELS
# ============================================
class PaymentCertificate(BaseModel):
    pc_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    project_id: str
    code_id: str
    vendor_id: str
    document_number: str  # Generated: PREFIX-SEQUENCE
    prefix: str
    sequence_number: int  # Global atomic counter
    bill_date: datetime
    current_bill_amount: float  # Must be > 0
    cumulative_previous_certified: float  # Sum of previous PCs
    total_cumulative_certified: float  # previous + current
    retention_percentage: float
    retention_current: float  # Current bill retention
    retention_cumulative: float  # Total retention held
    taxable_amount: float  # current_bill_amount - retention_current
    cgst_percentage: float
    sgst_percentage: float
    cgst_amount: float
    sgst_amount: float
    net_payable: float  # After retention and GST
    total_paid_cumulative: float  # Sum of all payments for this PC
    status: str  # Draft, Certified, Partially Paid, Fully Paid
    locked_flag: bool = False
    version_number: int = 1
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class PaymentCertificateCreate(BaseModel):
    project_id: str
    code_id: str
    vendor_id: str
    prefix: str = "PC"
    bill_date: datetime
    current_bill_amount: float
    retention_percentage: Optional[float] = None  # If None, use project default

class PaymentCertificateCertify(BaseModel):
    pass  # No additional fields - just status change

class PaymentCertificateRevise(BaseModel):
    current_bill_amount: Optional[float] = None
    retention_percentage: Optional[float] = None

class PaymentCertificateVersionSnapshot(BaseModel):
    snapshot_id: Optional[str] = Field(default=None, alias="_id")
    pc_id: str
    version_number: int
    snapshot_data: dict
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============================================
# PAYMENT MODELS
# ============================================
class Payment(BaseModel):
    payment_id: Optional[str] = Field(default=None, alias="_id")
    pc_id: str
    project_id: str
    code_id: str
    vendor_id: str
    payment_amount: float  # Must be > 0
    payment_date: datetime
    payment_reference: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class PaymentCreate(BaseModel):
    pc_id: str
    payment_amount: float
    payment_date: datetime
    payment_reference: str

# ============================================
# RETENTION RELEASE MODELS
# ============================================
class RetentionRelease(BaseModel):
    release_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    vendor_id: str
    release_amount: float
    release_date: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class RetentionReleaseCreate(BaseModel):
    project_id: str
    code_id: str
    vendor_id: str
    release_amount: float
    release_date: datetime

# ============================================
# VENDOR MODEL (Supporting Entity)
# ============================================
class Vendor(BaseModel):
    vendor_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    vendor_name: str
    vendor_code: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    active_status: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class VendorCreate(BaseModel):
    vendor_name: str
    vendor_code: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

# ============================================
# DOCUMENT SEQUENCE COUNTER MODEL
# ============================================
class DocumentSequence(BaseModel):
    sequence_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    prefix: str  # WO, PC, etc.
    current_sequence: int
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
