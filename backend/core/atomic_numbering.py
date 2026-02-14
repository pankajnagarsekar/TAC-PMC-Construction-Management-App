"""
PHASE 2: CORE ENGINE HARDENING - ATOMIC DOCUMENT NUMBERING

Provides:
1. SELECT ... FOR UPDATE style locking
2. Sequence assignment ONLY on Issue/Certification
3. Unique document number constraint
4. Collision retry mechanism
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
import logging
import asyncio

logger = logging.getLogger(__name__)


class SequenceCollisionError(Exception):
    """Raised when sequence collision occurs after max retries"""
    pass


class AtomicDocumentNumbering:
    """
    Atomic document number generator with collision protection.
    
    Uses findOneAndUpdate with $inc for atomic sequence generation.
    Implements retry mechanism for collision handling.
    """
    
    MAX_RETRIES = 5
    RETRY_DELAY_MS = 100  # Base delay in milliseconds
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_next_sequence(
        self,
        organisation_id: str,
        prefix: str,
        session=None
    ) -> int:
        """
        Get next atomic sequence number.
        
        Uses findOneAndUpdate with $inc for thread-safe increment.
        Returns the NEW sequence number after increment.
        """
        result = await self.db.document_sequences.find_one_and_update(
            {
                "organisation_id": organisation_id,
                "prefix": prefix
            },
            {
                "$inc": {"current_sequence": 1},
                "$set": {"updated_at": datetime.utcnow()},
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True,
            return_document=True,  # Return document AFTER update
            session=session
        )
        
        return result["current_sequence"]
    
    async def generate_document_number(
        self,
        organisation_id: str,
        prefix: str,
        session=None
    ) -> tuple:
        """
        Generate a unique document number with retry on collision.
        
        Returns:
            tuple: (document_number, sequence_number)
            
        Raises:
            SequenceCollisionError: If max retries exceeded
        """
        for attempt in range(self.MAX_RETRIES):
            try:
                sequence = await self.get_next_sequence(organisation_id, prefix, session)
                document_number = f"{prefix}-{sequence:06d}"
                
                # Verify uniqueness (belt and suspenders)
                # This should rarely trigger due to atomic $inc
                existing = await self.db.work_orders.find_one(
                    {"document_number": document_number},
                    session=session
                )
                
                if not existing:
                    existing = await self.db.payment_certificates.find_one(
                        {"document_number": document_number},
                        session=session
                    )
                
                if existing:
                    logger.warning(f"Document number collision: {document_number}, retry {attempt + 1}")
                    await asyncio.sleep(self.RETRY_DELAY_MS * (attempt + 1) / 1000)
                    continue
                
                logger.info(f"Generated document number: {document_number}")
                return document_number, sequence
                
            except Exception as e:
                logger.error(f"Sequence generation error: {str(e)}")
                if attempt == self.MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(self.RETRY_DELAY_MS * (attempt + 1) / 1000)
        
        raise SequenceCollisionError(
            f"Failed to generate unique document number after {self.MAX_RETRIES} attempts"
        )
    
    async def create_unique_constraints(self):
        """
        Create unique indexes on document numbers.
        """
        try:
            # Work Orders - unique document number (exclude DRAFT)
            await self.db.work_orders.create_index(
                [("document_number", 1)],
                unique=True,
                partialFilterExpression={"document_number": {"$ne": "DRAFT"}},
                name="unique_wo_document_number"
            )
            
            # Payment Certificates - unique document number (exclude DRAFT)
            await self.db.payment_certificates.create_index(
                [("document_number", 1)],
                unique=True,
                partialFilterExpression={"document_number": {"$ne": "DRAFT"}},
                name="unique_pc_document_number"
            )
            
            # Sequence collection - unique org+prefix
            await self.db.document_sequences.create_index(
                [("organisation_id", 1), ("prefix", 1)],
                unique=True,
                name="unique_sequence_key"
            )
            
            logger.info("Created unique document number constraints")
        except Exception as e:
            logger.warning(f"Index creation result: {str(e)}")
