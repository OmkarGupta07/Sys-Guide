# SysGuide — Full Syllabus

★ = asked very often in interviews · Pick v1 topics by ID (e.g. "B1-B6, E1-E5, T20-T30").

## A. Interview framework
- A1 ★ The 45-min HLD flow: requirements → estimates → API → data model → HLD → deep dive → trade-offs
- A2 ★ Functional vs non-functional requirements
- A3 How to drive the conversation, ask clarifying questions, handle "what if it 10x's?"
- A4 ★ Talking trade-offs (there is no "best", only "best for this case")
- A5 The 30-min LLD flow: entities → relationships → class diagram → patterns → code
- A6 Common mistakes (jumping to microservices, ignoring failure cases, no numbers)

## B. Fundamentals & networking
- B1 ★ Client-server model, request lifecycle (what happens when you type a URL)
- B2 ★ DNS (resolution, records A/CNAME/MX, TTL, GeoDNS)
- B3 IP, ports, subnets, NAT, private vs public IP
- B4 ★ TCP vs UDP
- B5 ★ HTTP methods, status codes, headers, cookies
- B6 HTTP/1.1 vs HTTP/2 vs HTTP/3 (QUIC)
- B7 ★ HTTPS / TLS handshake, certificates
- B8 OSI vs TCP/IP model (just enough)
- B9 Keep-alive, connection pooling
- B10 ★ Latency vs throughput vs bandwidth
- B11 Latency numbers every engineer should know
- B12 Proxy: forward vs reverse

## C. Estimation (back-of-the-envelope)
- C1 ★ DAU → QPS, peak QPS
- C2 ★ Storage estimation (per day / 5 years)
- C3 Bandwidth estimation
- C4 Memory for cache (80/20 rule)
- C5 Number of servers needed
- C6 Powers of 2, quick-math cheat sheet

## D. Scaling & load balancing
- D1 ★ Vertical vs horizontal scaling
- D2 ★ Stateless vs stateful services, session handling (sticky sessions vs shared store)
- D3 ★ Load balancer: what & why
- D4 ★ L4 vs L7 load balancing
- D5 ★ LB algorithms: round robin, weighted, least connections, IP hash, consistent hashing
- D6 Health checks, failover, active-passive vs active-active
- D7 Nginx / HAProxy basics
- D8 Auto-scaling (reactive, scheduled, predictive)
- D9 ★ Single point of failure (SPOF) and redundancy

## E. Caching & CDN
- E1 ★ Why cache, where to cache (client, CDN, LB, app, DB)
- E2 ★ Cache-aside, read-through, write-through, write-back, write-around
- E3 ★ Eviction: LRU, LFU, FIFO, TTL
- E4 ★ Redis vs Memcached; Redis data structures (sorted sets, streams, pub/sub)
- E5 ★ Cache invalidation strategies
- E6 Cache stampede / thundering herd, penetration, avalanche (+ fixes)
- E7 Distributed cache, hot keys
- E8 ★ CDN: push vs pull, edge, origin, TTL, versioned URLs
- E9 Browser caching headers (Cache-Control, ETag)

## F. Databases
- F1 ★ SQL vs NoSQL — when which
- F2 NoSQL types: key-value, document, wide-column, graph, time-series, vector
- F3 ★ ACID vs BASE
- F4 ★ Transactions & isolation levels (dirty read, phantom read, etc.)
- F5 ★ Indexes: B-tree, hash, composite, covering; when indexes hurt
- F6 LSM tree vs B-tree (write-heavy vs read-heavy)
- F7 Normalization vs denormalization
- F8 ★ Replication: leader-follower, multi-leader, leaderless
- F9 Sync vs async replication, replication lag
- F10 ★ Sharding / partitioning: range, hash, directory, geo
- F11 ★ Hot partitions, resharding
- F12 ★ Read replicas, CQRS-style read/write split
- F13 Connection pooling (HikariCP), N+1 query problem
- F14 Optimistic vs pessimistic locking
- F15 Database federation
- F16 ★ Object storage (S3/blob) vs block vs file storage
- F17 OLTP vs OLAP, data warehouse vs data lake
- F18 Picking a DB: Postgres, MySQL, MongoDB, Cassandra, DynamoDB, Redis, Neo4j, InfluxDB
- F19 Schema migrations without downtime
- F20 Soft delete, audit logs, data retention

## G. Distributed data structures & algorithms
- G1 ★ Consistent hashing (virtual nodes)
- G2 ★ Bloom filter
- G3 HyperLogLog (count unique)
- G4 Count-min sketch (top-K)
- G5 Merkle tree (anti-entropy)
- G6 ★ Geohash / quadtree (nearby search)
- G7 Trie (typeahead)
- G8 Skip list, inverted index
- G9 ★ Distributed unique ID: UUID, Snowflake, DB ticket server

## H. Communication & API design
- H1 ★ REST principles, resource naming
- H2 ★ REST vs GraphQL vs gRPC
- H3 ★ Polling vs long polling vs SSE vs WebSocket
- H4 Webhooks
- H5 ★ API versioning
- H6 ★ Pagination: offset vs cursor
- H7 ★ Idempotency & idempotency keys
- H8 Error handling, status codes, error contracts
- H9 ★ API gateway (routing, auth, rate limit, aggregation)
- H10 BFF (backend for frontend)
- H11 Sync vs async APIs (202 Accepted + status polling)
- H12 Batch APIs, bulk operations
- H13 API documentation (OpenAPI/Swagger)
- H14 Serialization: JSON vs Protobuf vs Avro

## I. Messaging & streaming
- I1 ★ Why async: decoupling, buffering, spikes
- I2 ★ Queue vs pub/sub vs event stream
- I3 ★ RabbitMQ (exchanges, routing, acks)
- I4 ★ Kafka (topics, partitions, offsets, consumer groups, retention, ordering)
- I5 ★ Kafka vs RabbitMQ vs SQS — when which
- I6 ★ Delivery semantics: at-most-once, at-least-once, exactly-once
- I7 Dead letter queue, poison messages, retries
- I8 Backpressure
- I9 ★ Event-driven architecture
- I10 Event sourcing
- I11 ★ CQRS
- I12 Stream processing (Kafka Streams, Flink — just concepts)
- I13 Change data capture (CDC, Debezium)

## J. Distributed systems theory
- J1 ★ CAP theorem
- J2 PACELC
- J3 ★ Consistency models: strong, eventual, causal, read-your-writes
- J4 Quorum (R + W > N)
- J5 Consensus: Raft / Paxos (intuition only)
- J6 Leader election, ZooKeeper / etcd
- J7 ★ Distributed locks (Redis Redlock, ZooKeeper)
- J8 Clocks: Lamport, vector clocks, clock skew
- J9 Gossip protocol, heartbeats
- J10 Split brain, fencing tokens
- J11 ★ Two-phase commit (2PC) and why it's avoided
- J12 ★ Saga: choreography vs orchestration, compensating transactions
- J13 ★ Transactional outbox pattern
- J14 Fallacies of distributed computing

## K. Microservices & resilience
- K1 ★ Monolith vs modular monolith vs microservices
- K2 Service boundaries, DDD (bounded context, aggregates)
- K3 Service discovery (client-side vs server-side, Eureka, Consul)
- K4 Service mesh, sidecar (Istio, Envoy)
- K5 ★ Rate limiting algorithms: token bucket, leaky bucket, fixed window, sliding log, sliding window counter
- K6 ★ Where to rate limit (client, gateway, service), distributed rate limiting with Redis
- K7 ★ Circuit breaker (Resilience4j)
- K8 ★ Retries, exponential backoff, jitter
- K9 Timeouts, bulkhead, fallback
- K10 Graceful degradation, load shedding
- K11 Strangler fig (migrating monolith → microservices)
- K12 Database per service, shared DB anti-pattern
- K13 Distributed transactions across services (links to J11-J13)

## L. Security
- L1 ★ Authentication vs authorization
- L2 ★ Sessions vs JWT
- L3 ★ OAuth 2.0 flows, OpenID Connect, SSO
- L4 RBAC vs ABAC
- L5 Password hashing (bcrypt/argon2), salting
- L6 Encryption at rest / in transit, KMS
- L7 Secrets management (Vault, AWS Secrets Manager)
- L8 ★ OWASP Top 10 (SQL injection, XSS, CSRF, SSRF)
- L9 ★ DDoS protection, WAF
- L10 CORS
- L11 API keys, mTLS, signed URLs
- L12 PII, GDPR / data privacy basics

## M. Observability & operations
- M1 ★ Logs, metrics, traces (three pillars)
- M2 Prometheus + Grafana
- M3 ELK / EFK stack
- M4 Distributed tracing (OpenTelemetry, Jaeger, correlation IDs)
- M5 Alerting, on-call, SLO-based alerts
- M6 ★ SLA vs SLO vs SLI, the "nines" of availability, error budgets
- M7 ★ Deployment strategies: rolling, blue-green, canary
- M8 Feature flags
- M9 ★ Disaster recovery: RPO, RTO, backups
- M10 Multi-region, active-active vs active-passive
- M11 Chaos engineering
- M12 Incident response & postmortems

## N. Infra basics
- N1 Linux essentials for backend devs (processes, ports, logs, systemd)
- N2 ★ Docker: images, containers, layers, Dockerfile, compose
- N3 ★ Kubernetes: pods, deployments, services, ingress, configmaps, secrets
- N4 ★ K8s scaling: HPA, VPA, cluster autoscaler
- N5 K8s probes (liveness, readiness), rolling updates
- N6 Helm
- N7 ★ CI/CD pipelines (GitHub Actions, Jenkins)
- N8 Infrastructure as Code (Terraform)
- N9 VPC, subnets, security groups, NAT gateway, bastion
- N10 Serverless: when it fits, cold starts

## O. Cloud — AWS (most asked) + Azure/GCP equivalents
- O1 ★ Regions, availability zones, edge locations
- O2 ★ EC2 (instance types, spot vs on-demand vs reserved)
- O3 ★ S3 (storage classes, lifecycle, presigned URLs)
- O4 ★ RDS / Aurora
- O5 ★ DynamoDB (partition key, GSI, on-demand vs provisioned)
- O6 ElastiCache
- O7 ★ ELB: ALB vs NLB
- O8 Auto Scaling Groups
- O9 ★ CloudFront (CDN)
- O10 Route 53 (DNS, routing policies)
- O11 ★ API Gateway
- O12 ★ Lambda
- O13 ★ SQS vs SNS vs EventBridge vs Kinesis
- O14 MSK (managed Kafka)
- O15 ECS vs EKS vs Fargate
- O16 IAM (users, roles, policies, least privilege)
- O17 VPC on AWS
- O18 CloudWatch, X-Ray
- O19 Secrets Manager, KMS, Cognito
- O20 OpenSearch (managed Elasticsearch)
- O21 Step Functions (orchestrated sagas)
- O22 AWS ↔ Azure ↔ GCP service name mapping table
- O23 Well-Architected Framework (6 pillars)

## P. Deployment ladder (cheapest → priciest)
- P1 Free tiers: Vercel/Netlify (frontend), Render, Railway, Fly.io, Supabase, Neon
- P2 Single cheap VPS (Hetzner, DigitalOcean, Oracle free tier) + Docker + Nginx
- P3 Managed PaaS (Heroku, Render paid, Elastic Beanstalk)
- P4 Cloud managed services (EC2 + RDS + S3 + CloudFront)
- P5 Containers at scale (ECS/EKS, GKE)
- P6 Multi-region, multi-AZ, global
- P7 ★ Cost thinking: what each stage costs per month in ₹, when to move up

## Q. Growth stages (what to add when)
- Q1 ★ 0–1K users: one server, one DB, keep it simple
- Q2 ★ 1K–10K: separate DB, backups, CDN for static, basic monitoring
- Q3 ★ 10K–100K: LB + multiple app servers, cache, read replicas, queue for async jobs
- Q4 ★ 100K–1M: sharding, microservices where needed, rate limiting, API gateway
- Q5 1M–10M+: multi-region, event streaming, dedicated search, polyglot persistence
- Q6 Signals that tell you it's time to scale (and signals that it isn't)

## R. Specialized building blocks
- R1 ★ Search: Elasticsearch, inverted index, relevance, sync DB → ES
- R2 ★ Notification system (push, SMS, email, fan-out, priority)
- R3 ★ Feed generation: fan-out on write vs fan-out on read
- R4 Media pipeline: upload, transcode, adaptive bitrate streaming (HLS/DASH)
- R5 Geo/location services, proximity search
- R6 ★ Payment systems: idempotency, double-entry ledger, reconciliation
- R7 ★ Harmful content detection / moderation pipeline (hashing, ML classifiers, human review, appeals)
- R8 Recommendation systems (concepts only)
- R9 Job scheduler / cron at scale, delayed jobs
- R10 File sync & chunking (Dropbox)
- R11 Real-time collaboration (OT vs CRDT)
- R12 Leaderboards (Redis sorted sets)
- R13 Analytics / clickstream pipelines
- R14 Multi-tenancy (SaaS)
- R15 Spam & fraud detection, bot detection

## S. HLD case studies
- S1 ★ URL shortener
- S2 ★ Rate limiter
- S3 ★ Chat app (WhatsApp)
- S4 ★ News feed (Instagram/Twitter)
- S5 ★ Notification service
- S6 ★ YouTube / Netflix
- S7 ★ Uber / Ola (ride matching)
- S8 ★ Typeahead / autocomplete
- S9 Web crawler
- S10 ★ Payment system / UPI-style
- S11 ★ Ticket booking (BookMyShow) — seat locking
- S12 Google Docs
- S13 ★ Distributed cache
- S14 Distributed key-value store
- S15 Food delivery (Swiggy/Zomato)
- S16 E-commerce (Amazon/Flipkart) incl. flash sale
- S17 Dropbox / Google Drive
- S18 Search engine (basic)
- S19 Hotel booking (Airbnb)
- S20 Stock exchange / trading platform
- S21 Metrics/logging system
- S22 Distributed job scheduler
- S23 Pastebin
- S24 Leaderboard / gaming
- S25 Content moderation platform

## T. LLD — principles & patterns
- T1 ★ OOP pillars: encapsulation, abstraction, inheritance, polymorphism
- T2 ★ SOLID (each principle with a Java bad → good example)
- T3 DRY, KISS, YAGNI, Law of Demeter
- T4 ★ Composition over inheritance
- T5 Interfaces vs abstract classes
- T6 Class relationships: association, aggregation, composition, dependency
- T7 UML class & sequence diagrams (just enough)
- T10 ★ Singleton (thread-safe, enum)
- T11 ★ Factory method
- T12 Abstract factory
- T13 ★ Builder
- T14 Prototype
- T20 ★ Adapter
- T21 ★ Decorator
- T22 ★ Proxy
- T23 ★ Facade
- T24 Composite
- T25 Bridge
- T26 Flyweight
- T30 ★ Strategy
- T31 ★ Observer
- T32 Command
- T33 ★ State
- T34 ★ Chain of responsibility
- T35 Template method
- T36 Iterator
- T37 Mediator
- T38 Visitor
- T39 Memento
- T40 ★ Dependency injection / IoC (how Spring does it)
- T41 Repository, DTO, service layer
- T42 Null object, specification patterns
- T50 ★ Concurrency: threads, synchronized, locks, volatile, atomic
- T51 ★ Thread pools, ExecutorService, CompletableFuture
- T52 ★ Producer-consumer, BlockingQueue
- T53 Deadlock, livelock, starvation
- T54 ConcurrentHashMap internals
- T55 Read-write locks, semaphores
- T60 ★ Clean code: naming, small functions, no magic numbers
- T61 Exception handling best practices
- T62 Layered architecture (controller → service → repository)
- T63 Hexagonal / clean architecture
- T64 Immutability, value objects
- T65 Unit testing, mocking, testable design
- T66 Code smells & refactoring
- T67 Anti-patterns (God class, spaghetti, golden hammer)

## U. LLD case studies
- U1 ★ Parking lot
- U2 ★ Elevator system
- U3 ★ Splitwise
- U4 ★ BookMyShow (seat booking + concurrency)
- U5 Snake & ladder
- U6 Tic-tac-toe / chess
- U7 ★ LRU cache
- U8 ★ Rate limiter (LLD)
- U9 Logger framework
- U10 ★ Vending machine (State pattern)
- U11 Library management
- U12 ATM (State + Chain of responsibility)
- U13 Hotel management
- U14 Cab booking
- U15 Notification service (Observer + Strategy)
- U16 Inventory / shopping cart
- U17 Pub-sub / message queue (LLD)
- U18 Task scheduler
- U19 Online auction
- U20 Food delivery (LLD)

## V. Data engineering basics
- V1 Batch vs stream processing
- V2 ETL vs ELT
- V3 Hadoop / Spark (concepts only)
- V4 Data partitioning for analytics, Parquet

## W. GenAI / agentic AI (later)
- W1 LLM basics: tokens, context window, temperature
- W2 Embeddings & vector databases
- W3 RAG architecture
- W4 LLM gateway, caching, rate limiting for LLM APIs
- W5 Guardrails, prompt injection
- W6 Agents, tool calling, orchestration, MCP
- W7 Evals & observability for LLM apps
- W8 Cost & latency optimization for LLM systems
- W9 Design case: ChatGPT-like system, AI customer support bot
