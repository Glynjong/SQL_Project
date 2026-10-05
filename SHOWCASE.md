# SQL Visual Debugger — Supported SQL Features

One runnable example for each SQL feature the app supports, written against the demo tables in `Postgres/schema.sql`
(`students`, `courses`, `enrollments`). The same queries power the **🏠 Home** tab, where each one can be run in place
or opened in the Query Tree tab to explore its physical plan, logical tree and provenance.

> Expected results below are for the seed data. Source of truth for the queries: `Frontend/src/data/showcaseQueries.js`.

## Contents

1. [SELECT · FROM · WHERE](#1-select--from--where) — Projection, filtering and joins
2. [Nested SELECT in FROM](#2-nested-select-in-from) — Derived tables (subqueries in the FROM clause)
3. [Aggregation](#3-aggregation) — GROUP BY · HAVING · MAX / MIN / COUNT / AVG
4. [Recursive query](#4-recursive-query) — WITH RECURSIVE
5. [Window functions](#5-window-functions) — OVER · ORDER BY · PARTITION BY · LIMIT

## 1. SELECT · FROM · WHERE

**Projection, filtering and joins**

The basic building blocks: pick columns (SELECT), name the tables (FROM) and keep only the rows that satisfy a condition (WHERE).

### 1.1 Filter and project one table

Students with a GPA of at least 3.5, best first.

```sql
SELECT first_name, last_name, gpa
FROM students
WHERE gpa >= 3.5
ORDER BY gpa DESC
```

**Expected result** (2 rows):

| first_name | last_name | gpa |
|---|---|---|
| Diana | Prince | 3.90 |
| Alice | Smith | 3.85 |

### 1.2 Join three tables and filter

Every A-grade in a Computer Science course, with who earned it.

```sql
SELECT s.first_name, c.course_code, e.grade
FROM students s
JOIN enrollments e ON e.student_id = s.student_id
JOIN courses c ON c.course_id = e.course_id
WHERE c.department = 'Computer Science'
  AND e.grade LIKE 'A%'
ORDER BY s.first_name, c.course_code
```

**Expected result** (3 rows):

| first_name | course_code | grade |
|---|---|---|
| Alice | CS101 | A |
| Alice | CS301 | A |
| Diana | CS301 | A |

**What to look at in the analyzer:** Logical Tree → Simplified: a `WHERE` node (in the join example its `AND` breaks into one node per condition), and the joins appear as `INNER JOIN … ON …` nodes.

## 2. Nested SELECT in FROM

**Derived tables (subqueries in the FROM clause)**

A query used as if it were a table. The inner query runs first and the outer query treats its result like any other table — useful for filtering on an aggregate.

### 2.1 Join against a derived table

Students enrolled in two or more courses. The subquery counts enrollments per student; the outer query joins it back to students.

```sql
SELECT s.first_name, s.last_name, t.course_count
FROM students s
JOIN (
  SELECT student_id, COUNT(*) AS course_count
  FROM enrollments
  GROUP BY student_id
) AS t ON t.student_id = s.student_id
WHERE t.course_count >= 2
ORDER BY s.first_name
```

**Expected result** (3 rows):

| first_name | last_name | course_count |
|---|---|---|
| Alice | Smith | 2 |
| Bob | Johnson | 2 |
| Diana | Prince | 2 |

### 2.2 Filter on an aggregate computed in a subquery

Departments whose courses average at least 3.5 credits.

```sql
SELECT d.department, d.avg_credits
FROM (
  SELECT department, ROUND(AVG(credits), 2) AS avg_credits
  FROM courses
  GROUP BY department
) AS d
WHERE d.avg_credits >= 3.5
```

**Expected result** (1 row):

| department | avg_credits |
|---|---|
| Computer Science | 4.00 |

**What to look at in the analyzer:** Logical Tree → Simplified: the `FROM` clause contains a purple **Subquery AS t / d** node — expand it to see the inner query’s own clauses.

## 3. Aggregation

**GROUP BY · HAVING · MAX / MIN / COUNT / AVG**

Collapse many rows into summary values. GROUP BY forms the groups, the aggregate functions summarise each group, and HAVING filters the groups themselves (WHERE filters rows before grouping).

### 3.1 Aggregates over a whole table

All five aggregates with no GROUP BY — the whole table is one group.

```sql
SELECT COUNT(*)            AS students,
       MAX(gpa)            AS max_gpa,
       MIN(gpa)            AS min_gpa,
       ROUND(AVG(gpa), 2)  AS avg_gpa
FROM students
```

**Expected result** (1 row):

| students | max_gpa | min_gpa | avg_gpa |
|---|---|---|---|
| 5 | 3.90 | 2.95 | 3.40 |

### 3.2 GROUP BY with HAVING

Per department: enrollments and the max / min / average GPA of the enrolled students. HAVING drops departments with fewer than two enrollments (English has one).

```sql
SELECT c.department,
       COUNT(*)            AS enrollments,
       MAX(s.gpa)          AS max_gpa,
       MIN(s.gpa)          AS min_gpa,
       ROUND(AVG(s.gpa), 2) AS avg_gpa
FROM enrollments e
JOIN courses c  ON c.course_id  = e.course_id
JOIN students s ON s.student_id = e.student_id
GROUP BY c.department
HAVING COUNT(*) >= 2
```

**Expected result** (2 rows):

| department | enrollments | max_gpa | min_gpa | avg_gpa |
|---|---|---|---|---|
| Computer Science | 5 | 3.90 | 2.95 | 3.55 |
| Mathematics | 2 | 3.20 | 3.10 | 3.15 |

**What to look at in the analyzer:** Logical Tree → Simplified: `GROUP BY` and `HAVING` clause nodes; the `SELECT` node lists the aggregate calls (`COUNT(*)`, `MAX(...)`, …). The physical plan shows an aggregate node.

## 4. Recursive query

**WITH RECURSIVE**

A common table expression that refers to itself: a starting (anchor) query, then a recursive step that keeps adding rows until it produces nothing new.

### 4.1 Walk a chain of rows

Starts at student 1 and repeatedly steps to the student whose id is one higher. The demo data has no hierarchy table, so this consecutive-id walk stands in for a parent → child walk.

```sql
WITH RECURSIVE student_chain(student_id, first_name, depth) AS (
  SELECT student_id, first_name, 1
  FROM students
  WHERE student_id = 1
  UNION ALL
  SELECT s.student_id, s.first_name, c.depth + 1
  FROM students s
  JOIN student_chain c ON s.student_id = c.student_id + 1
)
SELECT student_id, first_name, depth
FROM student_chain
```

**Expected result** (5 rows):

| student_id | first_name | depth |
|---|---|---|
| 1 | Alice | 1 |
| 2 | Bob | 2 |
| 3 | Charlie | 3 |
| 4 | Diana | 4 |
| 5 | Evan | 5 |

### 4.2 Generate a sequence

The smallest recursive query: count from 1 to 5 and square each number. No tables needed.

```sql
WITH RECURSIVE counter(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM counter WHERE n < 5
)
SELECT n, n * n AS square
FROM counter
```

**Expected result** (5 rows):

| n | square |
|---|---|
| 1 | 1 |
| 2 | 4 |
| 3 | 9 |
| 4 | 16 |
| 5 | 25 |

**What to look at in the analyzer:** Logical Tree → Simplified: a `WITH RECURSIVE` clause containing the CTE, whose body is a `UNION ALL` of the anchor (left) and recursive step (right). In the ProvSQL tab this query shows plain results with a notice: recursive CTEs need ProvSQL 1.7 or newer, and this project builds 1.5.0.

## 5. Window functions

**OVER · ORDER BY · PARTITION BY · LIMIT**

Compute a value for every row based on a "window" of related rows, without collapsing the rows the way GROUP BY does. ORDER BY inside OVER defines the ranking order, PARTITION BY restarts it per group.

### 5.1 Rank rows, then keep the top few

RANK() by GPA plus the overall average on every row (an empty OVER ()), then ORDER BY and LIMIT to keep the top three.

```sql
SELECT first_name, last_name, gpa,
       RANK() OVER (ORDER BY gpa DESC) AS gpa_rank,
       ROUND(AVG(gpa) OVER (), 2)      AS overall_avg
FROM students
ORDER BY gpa_rank
LIMIT 3
```

**Expected result** (3 rows):

| first_name | last_name | gpa | gpa_rank | overall_avg |
|---|---|---|---|---|
| Diana | Prince | 3.90 | 1 | 3.40 |
| Alice | Smith | 3.85 | 2 | 3.40 |
| Bob | Johnson | 3.20 | 3 | 3.40 |

### 5.2 Rank within each group

PARTITION BY restarts the numbering for every course: ROW_NUMBER() ranks the students in each course by GPA.

```sql
SELECT c.course_code, s.first_name, s.gpa,
       ROW_NUMBER() OVER (
         PARTITION BY c.course_code
         ORDER BY s.gpa DESC
       ) AS rank_in_course
FROM enrollments e
JOIN students s ON s.student_id = e.student_id
JOIN courses c  ON c.course_id  = e.course_id
ORDER BY c.course_code, rank_in_course
```

**Expected result** (8 rows):

| course_code | first_name | gpa | rank_in_course |
|---|---|---|---|
| CS101 | Alice | 3.85 | 1 |
| CS101 | Bob | 3.20 | 2 |
| CS101 | Charlie | 2.95 | 3 |
| CS301 | Diana | 3.90 | 1 |
| CS301 | Alice | 3.85 | 2 |
| ENG101 | Diana | 3.90 | 1 |
| MATH201 | Bob | 3.20 | 1 |
| MATH201 | Evan | 3.10 | 2 |

**What to look at in the analyzer:** Logical Tree → Full AST: the window functions appear as `FuncCall` nodes with an `over` (window definition). The physical plan shows a `WindowAgg` node.

---

**Note on the ProvSQL tab:** ProvSQL rewrites queries to track provenance and does not support every SQL shape
(for example `WITH RECURSIVE` before ProvSQL 1.7, or `ORDER BY` on an aggregate). When it cannot handle a query, the tab
falls back to sorting the rows itself where it can, and otherwise shows the plain results with a notice instead of failing.
All other tabs (Runner, Home, Explain, schema editing) run with ProvSQL switched off, so these limits never affect them.
