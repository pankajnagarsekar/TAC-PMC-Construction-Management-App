"""
PHASE 2: CORE ENGINE HARDENING - DECIMAL PRECISION & FINANCIAL UTILITIES

This module provides:
1. Decimal precision lock (2-decimal places)
2. Safe financial calculations
3. Value validation (no negative amounts)
4. Rounding at calculation boundary only
"""

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Union
import logging

logger = logging.getLogger(__name__)

# Precision configuration
DECIMAL_PLACES = 2
QUANTIZE_PATTERN = Decimal('0.01')


class FinancialPrecisionError(Exception):
    """Raised when financial precision validation fails"""
    pass


class NegativeValueError(Exception):
    """Raised when a negative financial value is detected"""
    pass


def to_decimal(value: Union[float, int, str, Decimal]) -> Decimal:
    """
    Convert any numeric value to Decimal.
    Does NOT round - preserves full precision for intermediate calculations.
    """
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        # Convert via string to avoid float precision issues
        return Decimal(str(value))
    if isinstance(value, str):
        return Decimal(value)
    raise FinancialPrecisionError(f"Cannot convert {type(value)} to Decimal")


def round_financial(value: Union[float, int, str, Decimal]) -> Decimal:
    """
    Round a value to 2 decimal places using banker's rounding.
    This should be called ONLY at calculation boundaries.
    """
    decimal_value = to_decimal(value)
    return decimal_value.quantize(QUANTIZE_PATTERN, rounding=ROUND_HALF_UP)


def to_float(value: Decimal) -> float:
    """
    Convert Decimal back to float for MongoDB storage.
    Rounds to 2 decimal places first.
    """
    rounded = round_financial(value)
    return float(rounded)


def validate_non_negative(value: Union[float, int, Decimal], field_name: str) -> None:
    """
    Validate that a financial value is not negative.
    Raises NegativeValueError if validation fails.
    """
    decimal_value = to_decimal(value)
    if decimal_value < Decimal('0'):
        raise NegativeValueError(
            f"Financial value '{field_name}' cannot be negative: {value}"
        )


def validate_positive(value: Union[float, int, Decimal], field_name: str) -> None:
    """
    Validate that a financial value is strictly positive (> 0).
    Raises NegativeValueError if validation fails.
    """
    decimal_value = to_decimal(value)
    if decimal_value <= Decimal('0'):
        raise NegativeValueError(
            f"Financial value '{field_name}' must be positive: {value}"
        )


def safe_multiply(a: Union[float, int, Decimal], b: Union[float, int, Decimal]) -> Decimal:
    """Safe multiplication preserving precision"""
    return to_decimal(a) * to_decimal(b)


def safe_divide(numerator: Union[float, int, Decimal], 
                denominator: Union[float, int, Decimal]) -> Decimal:
    """Safe division with zero check"""
    denom = to_decimal(denominator)
    if denom == Decimal('0'):
        return Decimal('0')
    return to_decimal(numerator) / denom


def safe_subtract(a: Union[float, int, Decimal], b: Union[float, int, Decimal]) -> Decimal:
    """Safe subtraction preserving precision"""
    return to_decimal(a) - to_decimal(b)


def safe_add(*values: Union[float, int, Decimal]) -> Decimal:
    """Safe addition of multiple values"""
    result = Decimal('0')
    for v in values:
        result += to_decimal(v)
    return result


def calculate_percentage(amount: Union[float, int, Decimal], 
                         percentage: Union[float, int, Decimal]) -> Decimal:
    """
    Calculate percentage of an amount.
    Example: calculate_percentage(1000, 10) = 100
    """
    return safe_multiply(to_decimal(amount), safe_divide(to_decimal(percentage), Decimal('100')))


# Work Order calculations with precision
def calculate_wo_values(
    rate: Union[float, int, Decimal],
    quantity: Union[float, int, Decimal],
    retention_percentage: Union[float, int, Decimal]
) -> dict:
    """
    Calculate Work Order derived values with decimal precision.
    
    LOCKED FORMULAS:
    - base_amount = rate * quantity
    - retention_amount = base_amount * (retention_percentage / 100)
    - net_wo_value = base_amount - retention_amount
    
    Returns rounded values ready for storage.
    """
    # Validate inputs
    validate_non_negative(rate, 'rate')
    validate_positive(quantity, 'quantity')
    validate_non_negative(retention_percentage, 'retention_percentage')
    
    # Calculate with full precision
    base_amount = safe_multiply(rate, quantity)
    retention_amount = calculate_percentage(base_amount, retention_percentage)
    net_wo_value = safe_subtract(base_amount, retention_amount)
    
    # Round at boundary
    return {
        'base_amount': to_float(round_financial(base_amount)),
        'retention_amount': to_float(round_financial(retention_amount)),
        'net_wo_value': to_float(round_financial(net_wo_value))
    }


# Payment Certificate calculations with precision
def calculate_pc_values(
    current_bill_amount: Union[float, int, Decimal],
    cumulative_previous_certified: Union[float, int, Decimal],
    retention_percentage: Union[float, int, Decimal],
    cgst_percentage: Union[float, int, Decimal],
    sgst_percentage: Union[float, int, Decimal]
) -> dict:
    """
    Calculate Payment Certificate derived values with decimal precision.
    
    LOCKED FORMULAS:
    - total_cumulative_certified = cumulative_previous_certified + current_bill_amount
    - retention_current = current_bill_amount * (retention_percentage / 100)
    - retention_cumulative = total_cumulative_certified * (retention_percentage / 100)
    - taxable_amount = current_bill_amount - retention_current
    - cgst_amount = taxable_amount * (cgst_percentage / 100)
    - sgst_amount = taxable_amount * (sgst_percentage / 100)
    - net_payable = taxable_amount + cgst_amount + sgst_amount
    
    Returns rounded values ready for storage.
    """
    # Validate inputs
    validate_positive(current_bill_amount, 'current_bill_amount')
    validate_non_negative(cumulative_previous_certified, 'cumulative_previous_certified')
    validate_non_negative(retention_percentage, 'retention_percentage')
    validate_non_negative(cgst_percentage, 'cgst_percentage')
    validate_non_negative(sgst_percentage, 'sgst_percentage')
    
    # Calculate with full precision
    total_cumulative_certified = safe_add(cumulative_previous_certified, current_bill_amount)
    retention_current = calculate_percentage(current_bill_amount, retention_percentage)
    retention_cumulative = calculate_percentage(total_cumulative_certified, retention_percentage)
    taxable_amount = safe_subtract(current_bill_amount, retention_current)
    cgst_amount = calculate_percentage(taxable_amount, cgst_percentage)
    sgst_amount = calculate_percentage(taxable_amount, sgst_percentage)
    net_payable = safe_add(taxable_amount, cgst_amount, sgst_amount)
    
    # Round at boundary
    return {
        'cumulative_previous_certified': to_float(round_financial(cumulative_previous_certified)),
        'total_cumulative_certified': to_float(round_financial(total_cumulative_certified)),
        'retention_current': to_float(round_financial(retention_current)),
        'retention_cumulative': to_float(round_financial(retention_cumulative)),
        'taxable_amount': to_float(round_financial(taxable_amount)),
        'cgst_amount': to_float(round_financial(cgst_amount)),
        'sgst_amount': to_float(round_financial(sgst_amount)),
        'net_payable': to_float(round_financial(net_payable)),
        'total_paid_cumulative': 0.0  # Initial value
    }
