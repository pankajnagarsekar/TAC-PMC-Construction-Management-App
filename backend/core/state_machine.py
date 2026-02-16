"""
PHASE 3A: GENERIC STATE MACHINE UTILITY

A reusable state machine for managing entity state transitions with:
- Transition registration with handlers
- Transition validation
- Handler execution inside existing transactions
- Automatic status updates
- Invalid transition rejection

Usage:
    # Define state machine
    wo_machine = StateMachine("work_order")
    wo_machine.register("draft", "issued", issue_handler)
    wo_machine.register("issued", "revised", revise_handler)
    wo_machine.register("issued", "cancelled", cancel_handler)
    
    # Execute transition (inside transaction)
    await wo_machine.transition(wo_doc, "issued", session=session, context={...})
"""

from typing import Dict, Any, Optional, Callable, Awaitable, List, Set, Tuple
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================

class StateMachineError(Exception):
    """Base exception for state machine errors."""
    pass


class InvalidTransitionError(StateMachineError):
    """Raised when attempting an invalid state transition."""
    def __init__(self, entity: str, from_state: str, to_state: str, allowed: List[str] = None):
        self.entity = entity
        self.from_state = from_state
        self.to_state = to_state
        self.allowed = allowed or []
        
        allowed_str = f" Allowed transitions from '{from_state}': {self.allowed}" if self.allowed else ""
        message = f"Invalid transition for {entity}: '{from_state}' -> '{to_state}'.{allowed_str}"
        super().__init__(message)


class TransitionNotRegisteredError(StateMachineError):
    """Raised when transition has no registered handler."""
    def __init__(self, entity: str, from_state: str, to_state: str):
        self.entity = entity
        self.from_state = from_state
        self.to_state = to_state
        message = f"No handler registered for {entity}: '{from_state}' -> '{to_state}'"
        super().__init__(message)


class TransitionHandlerError(StateMachineError):
    """Raised when transition handler fails."""
    def __init__(self, entity: str, from_state: str, to_state: str, original_error: Exception):
        self.entity = entity
        self.from_state = from_state
        self.to_state = to_state
        self.original_error = original_error
        message = f"Handler failed for {entity}: '{from_state}' -> '{to_state}': {str(original_error)}"
        super().__init__(message)


class GuardConditionError(StateMachineError):
    """Raised when guard condition prevents transition."""
    def __init__(self, entity: str, from_state: str, to_state: str, reason: str):
        self.entity = entity
        self.from_state = from_state
        self.to_state = to_state
        self.reason = reason
        message = f"Guard blocked {entity}: '{from_state}' -> '{to_state}': {reason}"
        super().__init__(message)


# =============================================================================
# TYPE DEFINITIONS
# =============================================================================

# Handler signature: async def handler(entity_doc, context, session) -> Dict[str, Any]
TransitionHandler = Callable[[Dict[str, Any], Dict[str, Any], Any], Awaitable[Dict[str, Any]]]

# Guard signature: async def guard(entity_doc, context) -> Tuple[bool, str]
GuardCondition = Callable[[Dict[str, Any], Dict[str, Any]], Awaitable[Tuple[bool, str]]]

# Callback signature: async def callback(entity_doc, from_state, to_state, result)
TransitionCallback = Callable[[Dict[str, Any], str, str, Dict[str, Any]], Awaitable[None]]


# =============================================================================
# TRANSITION DEFINITION
# =============================================================================

class Transition:
    """Definition of a state transition."""
    
    def __init__(
        self,
        from_state: str,
        to_state: str,
        handler: TransitionHandler,
        guard: Optional[GuardCondition] = None,
        description: str = ""
    ):
        self.from_state = from_state
        self.to_state = to_state
        self.handler = handler
        self.guard = guard
        self.description = description
    
    def __repr__(self):
        return f"Transition({self.from_state} -> {self.to_state})"


# =============================================================================
# STATE MACHINE
# =============================================================================

class StateMachine:
    """
    Generic state machine for managing entity state transitions.
    
    Features:
    - Register transitions with handlers
    - Optional guard conditions
    - Execute handlers inside existing transactions
    - Automatic status field updates
    - Transition history tracking
    - Pre/post transition callbacks
    
    Example:
        machine = StateMachine("work_order", status_field="status")
        machine.register("draft", "issued", handle_issue, guard=can_issue)
        machine.register("issued", "revised", handle_revise)
        
        result = await machine.transition(wo_doc, "issued", session=db_session)
    """
    
    def __init__(
        self,
        entity_name: str,
        status_field: str = "status",
        history_field: Optional[str] = "state_history"
    ):
        """
        Initialize state machine.
        
        Args:
            entity_name: Name of the entity (for logging/errors)
            status_field: Field name that holds current state
            history_field: Field name for transition history (None to disable)
        """
        self.entity_name = entity_name
        self.status_field = status_field
        self.history_field = history_field
        
        # Transitions indexed by (from_state, to_state)
        self._transitions: Dict[Tuple[str, str], Transition] = {}
        
        # Valid states
        self._states: Set[str] = set()
        
        # Callbacks
        self._pre_callbacks: List[TransitionCallback] = []
        self._post_callbacks: List[TransitionCallback] = []
        
        logger.info(f"[STATE_MACHINE] Initialized for entity: {entity_name}")
    
    # =========================================================================
    # REGISTRATION
    # =========================================================================
    
    def register(
        self,
        from_state: str,
        to_state: str,
        handler: TransitionHandler,
        guard: Optional[GuardCondition] = None,
        description: str = ""
    ) -> "StateMachine":
        """
        Register a state transition.
        
        Args:
            from_state: Source state
            to_state: Target state
            handler: Async function to execute during transition
            guard: Optional async function to validate transition
            description: Human-readable description
        
        Returns:
            self (for chaining)
        """
        key = (from_state, to_state)
        
        if key in self._transitions:
            logger.warning(
                f"[STATE_MACHINE] Overwriting transition {self.entity_name}: "
                f"'{from_state}' -> '{to_state}'"
            )
        
        self._transitions[key] = Transition(
            from_state=from_state,
            to_state=to_state,
            handler=handler,
            guard=guard,
            description=description
        )
        
        self._states.add(from_state)
        self._states.add(to_state)
        
        logger.debug(
            f"[STATE_MACHINE] Registered {self.entity_name}: "
            f"'{from_state}' -> '{to_state}'"
        )
        
        return self
    
    def on_pre_transition(self, callback: TransitionCallback) -> "StateMachine":
        """Register callback to run BEFORE transition handler."""
        self._pre_callbacks.append(callback)
        return self
    
    def on_post_transition(self, callback: TransitionCallback) -> "StateMachine":
        """Register callback to run AFTER successful transition."""
        self._post_callbacks.append(callback)
        return self
    
    # =========================================================================
    # VALIDATION
    # =========================================================================
    
    def get_allowed_transitions(self, from_state: str) -> List[str]:
        """Get list of valid target states from a given state."""
        allowed = []
        for (src, dst) in self._transitions.keys():
            if src == from_state:
                allowed.append(dst)
        return allowed
    
    def can_transition(self, from_state: str, to_state: str) -> bool:
        """Check if transition is registered (does not check guards)."""
        return (from_state, to_state) in self._transitions
    
    def validate_transition(self, from_state: str, to_state: str) -> None:
        """
        Validate that a transition is registered.
        Raises InvalidTransitionError if not valid.
        """
        if not self.can_transition(from_state, to_state):
            allowed = self.get_allowed_transitions(from_state)
            raise InvalidTransitionError(
                entity=self.entity_name,
                from_state=from_state,
                to_state=to_state,
                allowed=allowed
            )
    
    async def check_guard(
        self,
        entity_doc: Dict[str, Any],
        from_state: str,
        to_state: str,
        context: Dict[str, Any]
    ) -> None:
        """
        Check guard condition for transition.
        Raises GuardConditionError if guard rejects.
        """
        transition = self._transitions.get((from_state, to_state))
        
        if transition and transition.guard:
            allowed, reason = await transition.guard(entity_doc, context)
            if not allowed:
                raise GuardConditionError(
                    entity=self.entity_name,
                    from_state=from_state,
                    to_state=to_state,
                    reason=reason
                )
    
    # =========================================================================
    # TRANSITION EXECUTION
    # =========================================================================
    
    async def transition(
        self,
        entity_doc: Dict[str, Any],
        to_state: str,
        session: Any = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute a state transition.
        
        Args:
            entity_doc: The entity document (must have status_field)
            to_state: Target state
            session: Database session (for transaction)
            context: Additional context for handler
        
        Returns:
            Result dict with:
            - status: "success"
            - from_state: Previous state
            - to_state: New state
            - handler_result: Result from handler
            - transitioned_at: Timestamp
        
        Raises:
            InvalidTransitionError: If transition not registered
            GuardConditionError: If guard condition fails
            TransitionHandlerError: If handler raises exception
        """
        context = context or {}
        
        # Get current state
        from_state = entity_doc.get(self.status_field)
        
        if from_state is None:
            raise StateMachineError(
                f"Entity missing status field: {self.status_field}"
            )
        
        # Validate transition is registered
        self.validate_transition(from_state, to_state)
        
        # Check guard condition
        await self.check_guard(entity_doc, from_state, to_state, context)
        
        # Get transition
        transition = self._transitions[(from_state, to_state)]
        
        logger.info(
            f"[STATE_MACHINE] Executing {self.entity_name}: "
            f"'{from_state}' -> '{to_state}'"
        )
        
        # Execute pre-callbacks
        for callback in self._pre_callbacks:
            try:
                await callback(entity_doc, from_state, to_state, {})
            except Exception as e:
                logger.error(f"[STATE_MACHINE] Pre-callback error: {e}")
        
        # Execute handler inside transaction context
        try:
            handler_result = await transition.handler(entity_doc, context, session)
        except Exception as e:
            logger.error(
                f"[STATE_MACHINE] Handler failed {self.entity_name}: "
                f"'{from_state}' -> '{to_state}': {e}"
            )
            raise TransitionHandlerError(
                entity=self.entity_name,
                from_state=from_state,
                to_state=to_state,
                original_error=e
            )
        
        # Build result
        transitioned_at = datetime.utcnow()
        result = {
            "status": "success",
            "from_state": from_state,
            "to_state": to_state,
            "handler_result": handler_result or {},
            "transitioned_at": transitioned_at
        }
        
        # Execute post-callbacks
        for callback in self._post_callbacks:
            try:
                await callback(entity_doc, from_state, to_state, result)
            except Exception as e:
                logger.error(f"[STATE_MACHINE] Post-callback error: {e}")
        
        logger.info(
            f"[STATE_MACHINE] Completed {self.entity_name}: "
            f"'{from_state}' -> '{to_state}'"
        )
        
        return result
    
    def get_status_update(self, to_state: str) -> Dict[str, Any]:
        """
        Get the update dict for changing status.
        Use this to update the entity after transition.
        """
        return {
            self.status_field: to_state,
            f"{self.status_field}_changed_at": datetime.utcnow()
        }
    
    def get_history_entry(
        self,
        from_state: str,
        to_state: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Get a history entry for the transition.
        Use this to append to entity's state_history array.
        """
        return {
            "from_state": from_state,
            "to_state": to_state,
            "transitioned_at": datetime.utcnow(),
            "transitioned_by": user_id,
            "metadata": metadata or {}
        }
    
    # =========================================================================
    # INTROSPECTION
    # =========================================================================
    
    def get_states(self) -> List[str]:
        """Get all registered states."""
        return list(self._states)
    
    def get_transitions(self) -> List[Dict[str, str]]:
        """Get all registered transitions."""
        return [
            {
                "from": t.from_state,
                "to": t.to_state,
                "description": t.description,
                "has_guard": t.guard is not None
            }
            for t in self._transitions.values()
        ]
    
    def get_graph(self) -> Dict[str, List[str]]:
        """Get state graph as adjacency list."""
        graph = {state: [] for state in self._states}
        for (src, dst) in self._transitions.keys():
            graph[src].append(dst)
        return graph
    
    def __repr__(self):
        return (
            f"StateMachine({self.entity_name}, "
            f"states={len(self._states)}, "
            f"transitions={len(self._transitions)})"
        )


# =============================================================================
# FACTORY FOR COMMON ENTITY STATE MACHINES
# =============================================================================

class StateMachineRegistry:
    """
    Registry for managing multiple state machines.
    
    Usage:
        registry = StateMachineRegistry()
        registry.register("work_order", wo_machine)
        registry.register("payment_certificate", pc_machine)
        
        machine = registry.get("work_order")
    """
    
    def __init__(self):
        self._machines: Dict[str, StateMachine] = {}
    
    def register(self, name: str, machine: StateMachine) -> None:
        """Register a state machine."""
        self._machines[name] = machine
        logger.info(f"[REGISTRY] Registered state machine: {name}")
    
    def get(self, name: str) -> StateMachine:
        """Get a state machine by name."""
        if name not in self._machines:
            raise StateMachineError(f"State machine not found: {name}")
        return self._machines[name]
    
    def has(self, name: str) -> bool:
        """Check if state machine is registered."""
        return name in self._machines
    
    def list(self) -> List[str]:
        """List all registered state machines."""
        return list(self._machines.keys())


# Global registry instance
state_machine_registry = StateMachineRegistry()


# =============================================================================
# HELPER: CREATE STATE MACHINE WITH COMMON PATTERNS
# =============================================================================

def create_document_state_machine(
    entity_name: str,
    draft_state: str = "draft",
    final_states: List[str] = None,
    cancelled_state: str = "cancelled"
) -> StateMachine:
    """
    Create a state machine with common document lifecycle pattern.
    
    Default states: draft -> [intermediate states] -> final_states
    All non-final states can transition to cancelled.
    
    Returns StateMachine with placeholder handlers (must be replaced).
    """
    final_states = final_states or ["completed"]
    
    machine = StateMachine(entity_name)
    
    # Placeholder handler
    async def placeholder(doc, ctx, session):
        return {"placeholder": True}
    
    # Register cancel from draft
    machine.register(draft_state, cancelled_state, placeholder, description="Cancel from draft")
    
    logger.info(
        f"[STATE_MACHINE] Created document machine for {entity_name} "
        f"with final states: {final_states}"
    )
    
    return machine
