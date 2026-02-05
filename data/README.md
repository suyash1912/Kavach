In this folder, I store demo data assets for the KAVACH project.

I intentionally do not ship a binary `sample_transactions.xlsx` file
directly in this code submission, because I want to keep the repository
text‑only and lightweight. Instead, when I test the system, I normally
prepare a small Excel file with the following columns:

- `user_id`
- `amount`
- `category`
- `merchant`
- `country`
- `timestamp`

For example, I might create 200–500 rows that simulate a few users
spending across categories such as groceries, travel, and online
shopping. As long as the schema matches the list above, the rest of
the pipeline in this project should run end‑to‑end.

