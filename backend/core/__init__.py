"""
Phase 2 Core Engine Hardening Modules
"""
from .financial_precision import (
    to_decimal,
    round_financial,
    to_float,
    validate_non_negative,
    validate_positive,
    safe_multiply,
    safe_divide,
    safe_subtract,
    safe_add,
    calculate_percentage,
    calculate_wo_values,
    calculate_pc_values,
    FinancialPrecisionError,
    NegativeValueError
)

from .invariant_validator import (
    FinancialInvariantValidator,
    InvariantViolationError
)

from .duplicate_protection import (
    DuplicateInvoiceProtection,
    DuplicateInvoiceError
)

from .atomic_numbering import (
    AtomicDocumentNumbering,
    SequenceCollisionError
)

from .hardened_financial_engine import (
    HardenedFinancialEngine,
    TransactionError
)

__all__ = [
    # Financial Precision
    'to_decimal',
    'round_financial',
    'to_float',
    'validate_non_negative',
    'validate_positive',
    'safe_multiply',
    'safe_divide',
    'safe_subtract',
    'safe_add',
    'calculate_percentage',
    'calculate_wo_values',
    'calculate_pc_values',
    'FinancialPrecisionError',
    'NegativeValueError',
    # Invariant Validator
    'FinancialInvariantValidator',
    'InvariantViolationError',
    # Duplicate Protection
    'DuplicateInvoiceProtection',
    'DuplicateInvoiceError',
    # Atomic Numbering
    'AtomicDocumentNumbering',
    'SequenceCollisionError',
]
