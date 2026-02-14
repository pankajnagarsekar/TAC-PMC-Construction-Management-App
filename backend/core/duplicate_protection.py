"""
PHASE 2: CORE ENGINE HARDENING - DUPLICATE INVOICE PROTECTION

Prevents duplicate invoice certification:
- Checks (Vendor_ID + Project_ID + Invoice_Number) uniqueness
- Blocks certification if duplicate found
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class DuplicateInvoiceError(Exception):
    """Raised when duplicate invoice is detected"""
    def __init__(self, vendor_id: str, project_id: str, invoice_number: str, existing_pc_id: str):
        self.vendor_id = vendor_id
        self.project_id = project_id
        self.invoice_number = invoice_number
        self.existing_pc_id = existing_pc_id
        super().__init__(
            f"Duplicate invoice detected: Vendor={vendor_id}, Project={project_id}, "
            f"Invoice={invoice_number}. Existing PC: {existing_pc_id}"
        )


class DuplicateInvoiceProtection:
    """
    Service for preventing duplicate invoice certification.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def check_duplicate_invoice(
        self,
        vendor_id: str,
        project_id: str,
        invoice_number: str,
        exclude_pc_id: Optional[str] = None,
        session=None
    ) -> bool:
        """
        Check if an invoice already exists for the given vendor/project combination.
        
        Args:
            vendor_id: Vendor ID
            project_id: Project ID
            invoice_number: Invoice number to check
            exclude_pc_id: Optional PC ID to exclude (for revisions)
            session: Database session for transactions
            
        Returns:
            True if NO duplicate found (safe to proceed)
            
        Raises:
            DuplicateInvoiceError if duplicate found
        """
        query = {
            "vendor_id": vendor_id,
            "project_id": project_id,
            "invoice_number": invoice_number,
            "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}
        }
        
        # Exclude self for revisions
        if exclude_pc_id:
            from bson import ObjectId
            query["_id"] = {"$ne": ObjectId(exclude_pc_id)}
        
        existing = await self.db.payment_certificates.find_one(query, session=session)
        
        if existing:
            raise DuplicateInvoiceError(
                vendor_id=vendor_id,
                project_id=project_id,
                invoice_number=invoice_number,
                existing_pc_id=str(existing["_id"])
            )
        
        logger.debug(f"No duplicate invoice found for vendor:{vendor_id}, invoice:{invoice_number}")
        return True
    
    async def create_unique_constraint_index(self):
        """
        Create unique compound index for invoice duplicate prevention.
        
        Note: Only enforces uniqueness for certified invoices.
        Uses partial index to allow multiple drafts.
        """
        try:
            # Create partial unique index (only for non-draft status)
            await self.db.payment_certificates.create_index(
                [
                    ("vendor_id", 1),
                    ("project_id", 1),
                    ("invoice_number", 1)
                ],
                unique=True,
                partialFilterExpression={
                    "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]},
                    "invoice_number": {"$exists": True, "$ne": None}
                },
                name="unique_certified_invoice"
            )
            logger.info("Created unique invoice constraint index")
        except Exception as e:
            # Index may already exist
            logger.warning(f"Index creation result: {str(e)}")
