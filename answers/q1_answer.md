# Data Model for an E-Commerce System

## Step 1: Map the Transaction Flow First

Before tables, I sketch the high-level flow. Five core boxes:

1. **Customer** selects a **Product**
2. Customer creates an **Order** (one order = one or many products)
3. Order checks **Inventory**
4. Customer makes **Payment**
5. Payment confirms the Order and updates Inventory

I keep this minimal on purpose. At this stage I don't worry about refunds, subscription products, delivery methods, or partial payments. Those come next as I add complexity layer by layer.

## Step 2: Define the Tables

Starting with the simplest schema:

- **Customer** (id, name, email, phone)
- **Product** (id, name, price, category)
- **Order** (id, customer_id, total_amount, status, created_at)
- **OrderItem** (id, order_id, product_id, quantity, unit_price) — separate table so an order can have multiple products
- **Inventory** (id, product_id, stock)
- **Payment** (id, order_id, type, amount, status)

Relationships:
- Customer → Order (1:N)
- Order → OrderItem (1:N)
- OrderItem → Product (N:1)
- Product → Inventory (1:1)
- Order → Payment (1:1)

## Step 3: Then Add Complexity

**Normalization (3NF as baseline):**
- 1NF: no arrays in fields
- 2NF: total_amount stays on Order, unit_price stays on OrderItem (no duplication)
- 3NF: customer name doesn't get duplicated on Order — it lives only on Customer

**Where I'd denormalize for read speed:**
- Cache merchant/product ratings or quality scores on Product for fast deal-list queries
- Build a materialized view for analytics dashboards to avoid heavy joins

**Indexing:**
- Foreign keys (customer_id on Order, product_id on OrderItem) for fast joins
- Order.status and Order.created_at for fulfillment queries
- Product.category and Product.location for browse queries

**Metadata standard on every table:**
- created_at, updated_at
- deleted_at (soft delete) for audit and refund traceability
- Currency fields as Decimal(10,2), never floats

## Step 4: Open Questions I'd Ask Before Going Further

- Refund flow: partial or full? Do refunds reverse a Payment or create a new RefundPayment?
- Subscription products: separate table or recurring Order?
- Delivery: do we need an Address table? Multiple shipping addresses per customer?
- Multi-currency: store all transactions in cents to avoid float issues, with a currency code field?
- Risk and fraud: how do we flag suspicious orders or repeat refund abuse? Do we need a risk_score on Order or a separate fraud_signals table?
- Compliance and regulation: product policy enforcement (e.g., restricted/dangerous goods), data privacy (GDPR-style consent, PII handling), and AI usage policies if any AI-generated content touches the customer (a lesson from my Fundamental Operationalizing AI coursework — governance and trust need to be designed in, not bolted on).

## Note on Process

I keep a markdown template I use as a structured prompt for Cursor and Claude when collaborating on schema design — covers normalization, audit metadata, and indexing strategy. Happy to share if useful.