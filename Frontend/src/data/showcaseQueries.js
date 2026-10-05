// Example queries for the Home page and SHOWCASE.md, written against the demo
// schema in /Postgres/schema.sql (students, courses, enrollments). Everything
// sticks to portable SQL that Postgres runs as-is. Every AVG is wrapped in
// ROUND(..., 2) so results print identically across engines.

export const SHOWCASE = [
  {
    id: 'select-from-where',
    icon: '🔎',
    title: 'SELECT · FROM · WHERE',
    tagline: 'Projection, filtering and joins',
    description:
      'The basic building blocks: pick columns (SELECT), name the tables (FROM) and keep only the rows that satisfy a condition (WHERE).',
    examples: [
      {
        id: 'sfw-filter',
        title: 'Filter and project one table',
        note: 'Students with a GPA of at least 3.5, best first.',
        expectedRows: 2,
        sql: `SELECT first_name, last_name, gpa
FROM students
WHERE gpa >= 3.5
ORDER BY gpa DESC`,
      },
      {
        id: 'sfw-join',
        title: 'Join three tables and filter',
        note: 'Every A-grade in a Computer Science course, with who earned it.',
        expectedRows: 3,
        sql: `SELECT s.first_name, c.course_code, e.grade
FROM students s
JOIN enrollments e ON e.student_id = s.student_id
JOIN courses c ON c.course_id = e.course_id
WHERE c.department = 'Computer Science'
  AND e.grade LIKE 'A%'
ORDER BY s.first_name, c.course_code`,
      },
    ],
  },
  {
    id: 'nested-from',
    icon: '🧩',
    title: 'Nested SELECT in FROM',
    tagline: 'Derived tables (subqueries in the FROM clause)',
    description:
      'A query used as if it were a table. The inner query runs first and the outer query treats its result like any other table — useful for filtering on an aggregate.',
    examples: [
      {
        id: 'nf-join',
        title: 'Join against a derived table',
        note: 'Students enrolled in two or more courses. The subquery counts enrollments per student; the outer query joins it back to students.',
        expectedRows: 3,
        sql: `SELECT s.first_name, s.last_name, t.course_count
FROM students s
JOIN (
  SELECT student_id, COUNT(*) AS course_count
  FROM enrollments
  GROUP BY student_id
) AS t ON t.student_id = s.student_id
WHERE t.course_count >= 2
ORDER BY s.first_name`,
      },
      {
        id: 'nf-filter',
        title: 'Filter on an aggregate computed in a subquery',
        note: 'Departments whose courses average at least 3.5 credits.',
        expectedRows: 1,
        sql: `SELECT d.department, d.avg_credits
FROM (
  SELECT department, ROUND(AVG(credits), 2) AS avg_credits
  FROM courses
  GROUP BY department
) AS d
WHERE d.avg_credits >= 3.5`,
      },
    ],
  },
  {
    id: 'aggregation',
    icon: '📊',
    title: 'Aggregation',
    tagline: 'GROUP BY · HAVING · MAX / MIN / COUNT / AVG',
    description:
      'Collapse many rows into summary values. GROUP BY forms the groups, the aggregate functions summarise each group, and HAVING filters the groups themselves (WHERE filters rows before grouping).',
    examples: [
      {
        id: 'agg-whole',
        title: 'Aggregates over a whole table',
        note: 'All five aggregates with no GROUP BY — the whole table is one group.',
        expectedRows: 1,
        sql: `SELECT COUNT(*)            AS students,
       MAX(gpa)            AS max_gpa,
       MIN(gpa)            AS min_gpa,
       ROUND(AVG(gpa), 2)  AS avg_gpa
FROM students`,
      },
      {
        id: 'agg-group-having',
        title: 'GROUP BY with HAVING',
        note: 'Per department: enrollments and the max / min / average GPA of the enrolled students. HAVING drops departments with fewer than two enrollments (English has one).',
        expectedRows: 2,
        sql: `SELECT c.department,
       COUNT(*)            AS enrollments,
       MAX(s.gpa)          AS max_gpa,
       MIN(s.gpa)          AS min_gpa,
       ROUND(AVG(s.gpa), 2) AS avg_gpa
FROM enrollments e
JOIN courses c  ON c.course_id  = e.course_id
JOIN students s ON s.student_id = e.student_id
GROUP BY c.department
HAVING COUNT(*) >= 2`,
      },
    ],
  },
  {
    id: 'recursive',
    icon: '🔁',
    title: 'Recursive query',
    tagline: 'WITH RECURSIVE',
    description:
      'A common table expression that refers to itself: a starting (anchor) query, then a recursive step that keeps adding rows until it produces nothing new.',
    examples: [
      {
        id: 'rec-chain',
        title: 'Walk a chain of rows',
        note: 'Starts at student 1 and repeatedly steps to the student whose id is one higher. The demo data has no hierarchy table, so this consecutive-id walk stands in for a parent → child walk.',
        expectedRows: 5,
        sql: `WITH RECURSIVE student_chain(student_id, first_name, depth) AS (
  SELECT student_id, first_name, 1
  FROM students
  WHERE student_id = 1
  UNION ALL
  SELECT s.student_id, s.first_name, c.depth + 1
  FROM students s
  JOIN student_chain c ON s.student_id = c.student_id + 1
)
SELECT student_id, first_name, depth
FROM student_chain`,
      },
      {
        id: 'rec-counter',
        title: 'Generate a sequence',
        note: 'The smallest recursive query: count from 1 to 5 and square each number. No tables needed.',
        expectedRows: 5,
        sql: `WITH RECURSIVE counter(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM counter WHERE n < 5
)
SELECT n, n * n AS square
FROM counter`,
      },
    ],
  },
  {
    id: 'window',
    icon: '🪟',
    title: 'Window functions',
    tagline: 'OVER · ORDER BY · PARTITION BY · LIMIT',
    description:
      'Compute a value for every row based on a "window" of related rows, without collapsing the rows the way GROUP BY does. ORDER BY inside OVER defines the ranking order, PARTITION BY restarts it per group.',
    examples: [
      {
        id: 'win-rank',
        title: 'Rank rows, then keep the top few',
        note: 'RANK() by GPA plus the overall average on every row (an empty OVER ()), then ORDER BY and LIMIT to keep the top three.',
        expectedRows: 3,
        sql: `SELECT first_name, last_name, gpa,
       RANK() OVER (ORDER BY gpa DESC) AS gpa_rank,
       ROUND(AVG(gpa) OVER (), 2)      AS overall_avg
FROM students
ORDER BY gpa_rank
LIMIT 3`,
      },
      {
        id: 'win-partition',
        title: 'Rank within each group',
        note: 'PARTITION BY restarts the numbering for every course: ROW_NUMBER() ranks the students in each course by GPA.',
        expectedRows: 8,
        sql: `SELECT c.course_code, s.first_name, s.gpa,
       ROW_NUMBER() OVER (
         PARTITION BY c.course_code
         ORDER BY s.gpa DESC
       ) AS rank_in_course
FROM enrollments e
JOIN students s ON s.student_id = e.student_id
JOIN courses c  ON c.course_id  = e.course_id
ORDER BY c.course_code, rank_in_course`,
      },
    ],
  },
];

export const ALL_EXAMPLES = SHOWCASE.flatMap((cat) => cat.examples.map((ex) => ({ ...ex, category: cat.id })));
