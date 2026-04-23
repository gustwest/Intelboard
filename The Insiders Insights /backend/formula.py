"""Safe arithmetic expression evaluator for module formulas.

Supports: + - * / % ** parentheses, unary +/-, numeric literals,
variables (from a context dict), and a whitelist of functions
(min, max, abs, round, if_).

`if_(cond, a, b)` is how formulas can branch: `if_(reach > 0, impressions/reach, 0)`.
"""
from __future__ import annotations

import ast
import math
from typing import Any, Dict, List


_ALLOWED_FUNCS = {
    "min": min,
    "max": max,
    "abs": abs,
    "round": round,
    "if_": lambda cond, a, b: a if cond else b,
    "sqrt": math.sqrt,
    "log": math.log,
}

_BIN_OPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b if b else 0,
    ast.Mod: lambda a, b: a % b if b else 0,
    ast.Pow: lambda a, b: a ** b,
    ast.FloorDiv: lambda a, b: a // b if b else 0,
}

_UNARY = {
    ast.USub: lambda a: -a,
    ast.UAdd: lambda a: +a,
    ast.Not: lambda a: not a,
}

_CMP = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
}


class FormulaError(ValueError):
    pass


def _eval_node(node: ast.AST, ctx: Dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, ctx)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in ctx:
            return ctx[node.id]
        if node.id in _ALLOWED_FUNCS:
            return _ALLOWED_FUNCS[node.id]
        raise FormulaError(f"Unknown variable: {node.id}")
    if isinstance(node, ast.BinOp):
        op = _BIN_OPS.get(type(node.op))
        if not op:
            raise FormulaError(f"Unsupported operator: {type(node.op).__name__}")
        return op(_eval_node(node.left, ctx), _eval_node(node.right, ctx))
    if isinstance(node, ast.UnaryOp):
        op = _UNARY.get(type(node.op))
        if not op:
            raise FormulaError(f"Unsupported unary op: {type(node.op).__name__}")
        return op(_eval_node(node.operand, ctx))
    if isinstance(node, ast.Compare):
        left = _eval_node(node.left, ctx)
        for op, comparator in zip(node.ops, node.comparators):
            right = _eval_node(comparator, ctx)
            cmp = _CMP.get(type(op))
            if not cmp:
                raise FormulaError(f"Unsupported comparison: {type(op).__name__}")
            if not cmp(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.Call):
        func = _eval_node(node.func, ctx)
        args = [_eval_node(a, ctx) for a in node.args]
        return func(*args)
    if isinstance(node, ast.BoolOp):
        values = [_eval_node(v, ctx) for v in node.values]
        if isinstance(node.op, ast.And):
            return all(values)
        if isinstance(node.op, ast.Or):
            return any(values)
    raise FormulaError(f"Unsupported syntax: {type(node).__name__}")


def evaluate(expression: str, context: Dict[str, Any]) -> Any:
    """Evaluate an arithmetic expression with variables from context."""
    if not expression:
        return None
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as e:
        raise FormulaError(f"Invalid formula syntax: {e}")
    return _eval_node(tree, context)


# ------------------ Aggregations ------------------

def aggregate(values: List[Any], method: str) -> float:
    """Apply aggregation to a list of raw values. None values are skipped."""
    nums: List[float] = []
    for v in values:
        if v is None:
            continue
        try:
            nums.append(float(v))
        except (ValueError, TypeError):
            continue

    if not nums:
        return 0.0

    if method == "sum":
        return sum(nums)
    if method == "avg" or method == "mean":
        return sum(nums) / len(nums)
    if method == "min":
        return min(nums)
    if method == "max":
        return max(nums)
    if method == "count":
        return float(len(nums))
    if method == "latest":
        return nums[-1]
    if method == "first":
        return nums[0]
    raise FormulaError(f"Unknown aggregation: {method}")
