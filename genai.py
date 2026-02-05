"""
In this module, I integrate the KAVACH analytics layer with OpenRouter's
LLM API. My goal is not to let the model classify individual
transactions but instead to:

- explain why certain cases look risky,
- summarize the overall financial report,
- and answer ad-hoc questions from the user.

This implementation requires an OPENROUTER_KEY environment variable.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

from dotenv import load_dotenv
import requests

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _build_system_prompt() -> str:
    """
    In this helper, I define the base system prompt that sets the
    expectations for the model: I want it to speak like a financial
    analyst and never to override or recompute classification labels.
    """
    return (
        "You are a senior financial risk analyst helping me review a set of "
        "transaction analytics. You must NOT perform your own fraud "
        "classification or override existing risk scores. Instead, you "
        "only explain and summarize the insights that I provide.\n\n"
        "Speak in clear, professional language suitable for an internal "
        "analytics report. Be concise but insightful. When you mention "
        "users or transactions, always tie your explanation back to the "
        "numbers and risk indicators I pass to you."
    )


def _format_context(
    insights: Dict[str, Any], fraud_cases: List[Dict[str, Any]]
) -> str:
    """
    Here I turn the numeric insight dictionaries into a compact text
    block that the LLM can easily reason about.
    """
    lines: List[str] = []
    lines.append("=== Aggregated Insights ===")
    total_spend = insights.get("total_spend", 0.0)
    lines.append(f"Total spend observed: {total_spend:.2f}")

    lines.append("\nTop spending categories:")
    for cat in insights.get("top_categories", [])[:10]:
        lines.append(
            f"- {cat.get('category')}: {cat.get('total_spend', 0.0):.2f}"
        )

    lines.append("\nMonthly spending trend:")
    for month in insights.get("monthly_trends", []):
        lines.append(
            f"- {month.get('month')}: {month.get('total_spend', 0.0):.2f}"
        )

    lines.append("\nUser-level summaries:")
    for user in insights.get("user_summaries", []):
        lines.append(
            f"- user {user.get('user_id')}: "
            f"total_spend={user.get('total_spend', 0.0):.2f}, "
            f"avg_transaction={user.get('avg_transaction', 0.0):.2f}, "
            f"tx_count={user.get('tx_count', 0)}"
        )

    lines.append("\n=== Flagged / Risky Transactions ===")
    if not fraud_cases:
        lines.append("No transactions are currently flagged as risky.")
    else:
        for tx in fraud_cases[:50]:
            user = tx.get("user_id")
            amt = tx.get("amount")
            cat = tx.get("category")
            country = tx.get("country")
            ts = tx.get("timestamp")
            score = tx.get("fraud_score", None)
            rb_flag = tx.get("rule_based_fraud_flag", False)
            model_flag = tx.get("model_fraud_flag", False)
            lines.append(
                f"- user={user}, amount={amt:.2f}, category={cat}, "
                f"country={country}, timestamp={ts}, "
                f"fraud_score={score}, "
                f"rule_based_flag={rb_flag}, model_flag={model_flag}"
            )

    return "\n".join(lines)


def ask_financial_analyst(
    user_query: str,
    insights: Dict[str, Any],
    fraud_cases: List[Dict[str, Any]],
    max_tokens: int = 450,
    temperature: float = 0.4,
    top_p: float = 0.9,
) -> str:
    """
    This is the main entry point that the FastAPI app calls whenever
    a user interacts with the AI panel on the dashboard.

    I combine:
    - a strict system prompt,
    - a structured context block summarizing the analytics,
    - and the free-form user question.

    I then send everything to the OpenRouter API and return the response
    as plain text.
    """
    load_dotenv()
    api_key = os.environ.get("OPENROUTER_KEY", "").strip()
    if not api_key:
        return (
            "OPENROUTER_KEY is missing. Please set it in your environment or .env file."
        )

    context_block = _format_context(insights, fraud_cases)
    user_content = (
        f"Here is the current analytics context:\n\n{context_block}\n\n"
        f"User question: {user_query}\n\n"
        "Please answer as a financial analyst. Do NOT assign new "
        "fraud labels; only explain and summarize based on the "
        "context above."
    )

    payload = {
        "model": DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": _build_system_prompt()},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        logger.info("Calling OpenRouter model: %s", DEFAULT_MODEL)
        response = requests.post(OPENROUTER_URL, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        data = response.json()

        choices = data.get("choices", [])
        if choices:
            choice = choices[0] or {}
            message = choice.get("message", {})
            content = message.get("content")
            if isinstance(content, list):
                content = "".join(
                    part.get("text", "") for part in content if isinstance(part, dict)
                )
            if content:
                return str(content).strip()
            if choice.get("text"):
                return str(choice.get("text")).strip()

        return "I received an empty response from the OpenRouter API."
    except Exception:
        logger.exception("OpenRouter API call failed.")
        return (
            "I could not reach the OpenRouter API right now. Please verify your "
            "OPENROUTER_KEY and internet connection, then try again."
        )


__all__ = ["ask_financial_analyst"]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    dummy_insights = {
        "total_spend": 12500.0,
        "top_categories": [
            {"category": "Travel", "total_spend": 4200.0},
            {"category": "Food", "total_spend": 3100.0},
        ],
        "monthly_trends": [
            {"month": "2025-01", "total_spend": 5400.0},
            {"month": "2025-02", "total_spend": 7100.0},
        ],
        "user_summaries": [
            {
                "user_id": "U-102",
                "total_spend": 9000.0,
                "avg_transaction": 300.0,
                "tx_count": 30,
            },
        ],
    }
    dummy_fraud_cases = [
        {
            "user_id": "U-102",
            "amount": 950.0,
            "category": "Travel",
            "country": "US",
            "timestamp": "2025-02-01T10:30:00",
            "fraud_score": 0.78,
            "rule_based_fraud_flag": True,
            "model_fraud_flag": True,
        }
    ]

    print(
        ask_financial_analyst(
            user_query="Which transactions look most risky and why?",
            insights=dummy_insights,
            fraud_cases=dummy_fraud_cases,
        )
    )
