# 🏗️ Data Model Specification: [Project Name]

> **AI INSTRUCTIONS for Cursor/Claude/Codex:** > When interacting with this file, act as a Senior Database Architect. Prioritize 3rd Normal Form (3NF) for data integrity, document all relationships, and only suggest denormalization where read-performance explicitly requires it. Always include standard audit timestamps.

---

## 1. Business Requirements & Objectives
*Define the "why" before the "how" to ensure the model serves the product.*
- **Core Product Goal:** [e.g., Enable users to track daily habits]
- **Primary Stakeholders:** [e.g., End-users, Admin team]
- **Key Queries to Optimize (Use Cases):** - [e.g., "Show me all active habits for User X today"]
  - [e.g., "Calculate the 30-day retention rate of new users"]

---

## 2. Conceptual Model (Entities & Relationships)
*High-level abstraction of the system. Keep it human-readable.*

**Core Entities:**
1. `[Entity 1]` (e.g., User)
2. `[Entity 2]` (e.g., Habit)
3. `[Entity 3]` (e.g., Habit_Log)

**Relationships:**
- `[Entity 1]` has a [One-to-One / One-to-Many / Many-to-Many] relationship with `[Entity 2]`.
- `[Entity 2]` has a [One-to-One / One-to-Many / Many-to-Many] relationship with `[Entity 3]`.

---

## 3. Logical Data Model (Normalization Checklist)
*Ensure data integrity by adhering to standard normalization rules.*

- [ ] **1NF (Atomicity):** All columns contain single, atomic values. No arrays or comma-separated lists stored in a single text field.
- [ ] **2NF (No Partial Dependencies):** All non-key attributes depend on the *entire* primary key. (Composite keys are broken down if necessary).
- [ ] **3NF (No Transitive Dependencies):** No non-key attribute depends on another non-key attribute. (Everything relates directly to the primary key).

---

## 4. Physical Schema & Performance Strategy
*Table structures, keys, and optimization techniques.*

### Table Definitions

| Table Name | Primary Key | Foreign Keys | Indexing Strategy |
| :--- | :--- | :--- | :--- |
| `[table_1]` | `id` | `[-]` | Index `[column_name]` for frequent lookups. |
| `[table_2]` | `id` | `[table_1_id]` | Index `[foreign_key]` to speed up joins. |

### Optimization & Denormalization
*Only fill this out if specific bottlenecks are anticipated.*
- **Target Area:** [e.g., Analytics Dashboard]
- **Denormalization Action:** [e.g., Create a materialized view combining `users` and `logs`]
- **Justification:** [e.g., Prevents running a massive 4-table join every time a user loads their dashboard.]

---

## 5. Standard Metadata & Data Dictionary
*Rules for column definitions and audit trails.*

**Global Requirements:**
- Every table must include `created_at` (timestamp) and `updated_at` (timestamp).
- Soft deletes (optional): Use `deleted_at` instead of hard dropping records if historical integrity is needed.

**Data Dictionary (Key Enums & Types):**
- `[column_name]`: Enum `[value_1, value_2, value_3]`
- `[column_name]`: Decimal `(10,2)` (Always use exact precision for currency/financials, never floats).