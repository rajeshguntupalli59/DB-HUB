"""SQL anti-pattern rewriter — DB-agnostic, pure text analysis."""
from __future__ import annotations
import re

RULES: list[dict] = []


def _rule(severity: str, issue: str):
    def decorator(fn):
        RULES.append({"fn": fn, "severity": severity, "issue": issue})
        return fn
    return decorator


@_rule("high", "SELECT * used")
def check_select_star(sql: str) -> list[dict]:
    if re.search(r'SELECT\s+\*', sql, re.IGNORECASE):
        return [{"issue": "SELECT * fetches all columns — specify only needed columns", "severity": "high",
                 "original": "SELECT *",
                 "suggestion": "List only the columns your application needs",
                 "rewritten_sql": re.sub(r'SELECT\s+\*', 'SELECT col1, col2 /* specify columns */', sql, flags=re.IGNORECASE, count=1)}]
    return []


@_rule("high", "OR in WHERE can prevent index use")
def check_or_clause(sql: str) -> list[dict]:
    if re.search(r'\bOR\b', sql, re.IGNORECASE) and re.search(r'\bWHERE\b', sql, re.IGNORECASE):
        return [{"issue": "OR in WHERE can prevent index use — consider UNION ALL", "severity": "high",
                 "original": "WHERE ... OR ...",
                 "suggestion": "Replace OR with UNION ALL so each branch can use its own index",
                 "rewritten_sql": None}]
    return []


@_rule("high", "Function on indexed column disables index")
def check_function_on_column(sql: str) -> list[dict]:
    matches = re.compile(r'WHERE\s+\w+\s*\(\s*(\w+\.\w+|\w+)\s*\)', re.IGNORECASE).findall(sql)
    return [{"issue": f"Function on column '{m}' prevents index use", "severity": "high",
             "original": f"WHERE func({m}) = ...",
             "suggestion": "Apply the function to the literal side, or use a function-based/computed index",
             "rewritten_sql": None} for m in matches]


@_rule("medium", "LIKE with leading wildcard prevents index")
def check_leading_wildcard(sql: str) -> list[dict]:
    if re.search(r"LIKE\s+'%", sql, re.IGNORECASE):
        return [{"issue": "LIKE '%...' cannot use a B-tree index", "severity": "medium",
                 "original": "LIKE '%value'",
                 "suggestion": "Use full-text search or reverse the string with LIKE 'eulav%'",
                 "rewritten_sql": None}]
    return []


@_rule("medium", "SELECT DISTINCT may indicate a join problem")
def check_distinct(sql: str) -> list[dict]:
    if re.search(r'\bSELECT\s+DISTINCT\b', sql, re.IGNORECASE):
        return [{"issue": "SELECT DISTINCT forces a sort/hash — verify duplicates are intentional", "severity": "medium",
                 "original": "SELECT DISTINCT",
                 "suggestion": "Fix the JOIN condition if duplicates come from it, or use GROUP BY for clarity",
                 "rewritten_sql": None}]
    return []


@_rule("medium", "NOT IN with subquery is unsafe on NULLs")
def check_not_in(sql: str) -> list[dict]:
    if re.search(r'\bNOT\s+IN\s*\(SELECT\b', sql, re.IGNORECASE):
        return [{"issue": "NOT IN (SELECT ...) returns no rows if subquery contains NULL", "severity": "medium",
                 "original": "NOT IN (SELECT ...)",
                 "suggestion": "Replace with NOT EXISTS or LEFT JOIN ... WHERE right.id IS NULL",
                 "rewritten_sql": re.sub(
                     r'WHERE\s+(\w+(?:\.\w+)?)\s+NOT\s+IN\s*\(SELECT\s+(\w+(?:\.\w+)?)\s+FROM\s+(\w+(?:\.\w+)?)',
                     r'WHERE NOT EXISTS (SELECT 1 FROM \3 WHERE \2 = \1', sql, flags=re.IGNORECASE, count=1)}]
    return []


@_rule("medium", "Implicit cross join from comma-separated tables")
def check_cross_join(sql: str) -> list[dict]:
    if re.search(r'FROM\s+\w+\s*,\s*\w+', sql, re.IGNORECASE):
        return [{"issue": "Comma-separated tables create an implicit CROSS JOIN", "severity": "medium",
                 "original": "FROM table1, table2",
                 "suggestion": "Use explicit JOIN ... ON syntax",
                 "rewritten_sql": None}]
    return []


@_rule("low", "Large IN list — consider a temp table")
def check_large_in_list(sql: str) -> list[dict]:
    results = []
    for m in re.findall(r'\bIN\s*\(([^)]+)\)', sql, re.IGNORECASE):
        items = [x.strip() for x in m.split(",")]
        if len(items) > 50:
            results.append({"issue": f"IN list with {len(items)} literals — may cause plan instability", "severity": "low",
                            "original": f"IN ({m[:60]}...)",
                            "suggestion": "Load values into a temp/staging table and JOIN",
                            "rewritten_sql": None})
    return results


@_rule("low", "Large OFFSET pagination is slow")
def check_offset(sql: str) -> list[dict]:
    if re.search(r'\bOFFSET\s+\d{4,}\b', sql, re.IGNORECASE):
        return [{"issue": "Large OFFSET scans and discards many rows", "severity": "low",
                 "original": "LIMIT n OFFSET large_number",
                 "suggestion": "Use keyset pagination: WHERE id > last_seen_id ORDER BY id LIMIT n",
                 "rewritten_sql": None}]
    return []


def rewrite_query(sql: str) -> list[dict]:
    suggestions = []
    for rule in RULES:
        try:
            suggestions.extend(rule["fn"](sql))
        except Exception:
            pass
    return suggestions
