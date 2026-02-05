# TODO: Fix Flagged Transactions Section

## Task
Fix the "Flagged Transactions" section to show only fraudulent/flagged transactions instead of all transactions.

## Progress
- [x] 1. Analyze the issue in insights.py and script.js
- [x] 2. Modify build_fraud_table() to filter flagged transactions only
- [ ] 3. Test the fix

## Steps to Complete

### Step 1: Modify build_fraud_table() in insights.py
Change the function to filter transactions where:
- `rule_based_fraud_flag` is True, OR
- `model_fraud_flag` is True, OR
- `fraud_score` > 0.5 (additional filter for high-risk transactions)

### Step 2: Test
Run the application and verify that only flagged transactions appear in the "Flagged Transactions" table.

