# AGENTS.md

## Database Rules

- Never fetch all transaction rows at once.
- Always use pagination for transaction tables.
- Prefer Supabase `.range()` queries.
- Use date filtering for financial queries.
- Use SQL aggregates or RPC for reports and totals.
- Avoid frontend-side aggregation for large datasets.

## Supabase Rules

- Default query limit should stay optimized.
- Do not increase Max Rows unnecessarily.
- Financial data can exceed 5000 rows per month.
- Use server-side pagination whenever possible.

## Transaction Table Rules

Preferred pattern:

```js
.select('*', { count: 'exact' })
.order('created_at', { ascending: false })
.range(offset, offset + limit - 1)
```

## For summaries/reports:

- Use SQL aggregate
- Use RPC function
- Avoid loading all transactions into browser memory