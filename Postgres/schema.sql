-- Seed schema for the SQL Visual Debugger demo tables.
-- Runs automatically via docker-entrypoint-initdb.d on a fresh postgres_data
-- volume (see /Postgres/Dockerfile and DOCKER_GUIDE.md). If you change this
-- file after a volume has already been initialized, it will NOT be re-run —
-- reset with `docker compose down -v && docker compose up --build`, or run
-- this file's contents manually through the app's Query Runner / pgAdmin.

-- Clean up existing tables if re-running
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. Create Students Table
CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    gpa NUMERIC(3, 2)
);

-- 2. Create Courses Table
CREATE TABLE courses (
    course_id SERIAL PRIMARY KEY,
    course_code VARCHAR(10) UNIQUE NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    department VARCHAR(50),
    credits INT DEFAULT 3
);

-- 3. Create Enrollments Table (Establishes foreign keys for Schema Visualizer)
CREATE TABLE enrollments (
    enrollment_id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(student_id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(course_id) ON DELETE CASCADE,
    grade VARCHAR(2),
    semester VARCHAR(20)
);

-- Insert Sample Students
INSERT INTO students (first_name, last_name, email, enrollment_date, gpa) VALUES
('Alice', 'Smith', 'alice.smith@university.edu', '2022-08-15', 3.85),
('Bob', 'Johnson', 'bob.j@university.edu', '2021-08-15', 3.20),
('Charlie', 'Brown', 'cbrown@university.edu', '2023-01-10', 2.95),
('Diana', 'Prince', 'diana.p@university.edu', '2022-08-15', 3.90),
('Evan', 'Wright', 'ewright@university.edu', '2020-08-15', 3.10);

-- Insert Sample Courses
INSERT INTO courses (course_code, course_name, department, credits) VALUES
('CS101', 'Introduction to Computer Science', 'Computer Science', 4),
('CS301', 'Database Systems', 'Computer Science', 4),
('MATH201', 'Linear Algebra', 'Mathematics', 3),
('ENG101', 'Composition and Literature', 'English', 3);

-- Insert Sample Enrollments
INSERT INTO enrollments (student_id, course_id, grade, semester) VALUES
(1, 1, 'A', 'Fall 2022'),
(1, 2, 'A', 'Fall 2023'),
(2, 1, 'B', 'Fall 2022'),
(2, 3, 'B+', 'Spring 2023'),
(3, 1, 'C+', 'Fall 2023'),
(4, 2, 'A', 'Fall 2023'),
(4, 4, 'A-', 'Spring 2023'),
(5, 3, 'B', 'Spring 2022');
