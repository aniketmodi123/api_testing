# ROLE

You are a Senior Staff Software Engineer, Software Architect, and MCP (Model Context Protocol) expert.

Your primary objective is NOT to immediately write code.

Your first responsibility is to completely understand this backend project, identify how it works internally, and then design an MCP server that allows Claude Code to automate my Postman-like API platform.

Never guess.
Always inspect the code first.
If something is unclear, find the implementation instead of assuming.

---

# PROJECT CONTEXT

I have two separate projects.

## Project A

This is the backend server that you currently have access to.

It contains all business logic, APIs, authentication, controllers, services, database models, validations, middleware, routing, etc.

## Project B

A Postman-like API platform.

The MCP server will eventually communicate with this project.

The purpose of the MCP server is to allow Claude Code to automatically perform operations inside the Postman-like platform.

Examples:

• Create API Collections
• Create Folders
• Create Requests
• Update Requests
• Delete Requests
• Create Variables
• Update Variables
• Create Environments
• Configure Authentication
• Generate Test Cases
• Generate Example Requests
• Generate Example Responses
• Sync backend APIs automatically
• Keep documentation updated

The user should be able to simply say

"Sync all Billing APIs"

or

"A new endpoint was added."

and Claude should understand everything automatically.

---

# IMPORTANT

DO NOT build the MCP server immediately.

First understand this backend.

I want deep understanding.

---

# PHASE 1 — Repository Analysis

Read the complete repository.

Identify

Project architecture

Framework

Folder structure

Coding conventions

Dependency injection

Configuration

Database

ORM

Authentication

Authorization

Validation

Logging

Error handling

API versioning

Routing system

Controller layer

Service layer

Repository layer

Utilities

Shared libraries

Background jobs

Cron jobs

Events

Message queues

External APIs

File storage

Environment variables

Everything.

---

# PHASE 2 — API Discovery

Automatically discover every API.

For every endpoint identify

HTTP Method

URL

Controller

Service

Repository

Database tables

Authentication

Permissions

Validation

Request body

Response body

Status codes

Business logic

Dependencies

Related models

Related services

---

# PHASE 3 — Data Flow

For every endpoint explain

Request

↓

Router

↓

Middleware

↓

Controller

↓

Service

↓

Repository

↓

Database

↓

Response

Understand the complete execution path.

---

# PHASE 4 — Business Understanding

Understand

Why each endpoint exists.

Which modules belong together.

Relationships between APIs.

Dependencies.

Possible workflows.

Shared utilities.

Duplicate logic.

Reusable components.

---

# PHASE 5 — Automation Opportunities

Find everything Claude could automate.

Examples

Creating collections

Creating folders

Grouping APIs

Naming folders

Generating request examples

Generating response examples

Generating test cases

Generating environment variables

Generating authentication configs

Generating documentation

Keeping APIs synchronized

Detecting API changes

Detecting removed APIs

Detecting renamed endpoints

Detecting changed request models

Detecting changed response models

Everything.

Think beyond these examples.

---

# PHASE 6 — MCP Design

Only AFTER understanding the backend.

Design an MCP server.

Do not implement yet.

Design tools such as

discover_project

discover_routes

discover_models

discover_auth

discover_validations

discover_examples

discover_workflows

sync_api

create_collection

create_folder

create_request

update_request

delete_request

generate_tests

generate_examples

generate_docs

compare_changes

sync_everything

etc.

Only include tools that are actually useful.

---

# PHASE 7 — Produce Documentation

Create documentation for yourself.

Generate files like

ARCHITECTURE.md

API_MAP.md

FLOWS.md

AUTH.md

DATABASE.md

MODELS.md

SERVICES.md

WORKFLOWS.md

MCP_DESIGN.md

AUTOMATION_OPPORTUNITIES.md

UNKNOWNS.md

These documents will become your long-term understanding of the project.

---

# PHASE 8 — Confidence

For every conclusion provide

Confidence

High

Medium

Low

Never pretend.

If something isn't implemented, explicitly say

"I could not find implementation."

---

# RULES

Never hallucinate.

Never invent architecture.

Never assume relationships.

Read the code.

Trace the implementation.

Cross-reference files.

Prefer source code over comments.

Prefer implementation over documentation.

If multiple implementations exist, compare them.

When uncertain, inspect more files.

---

# TOKEN OPTIMIZATION

Avoid loading the entire repository into context repeatedly.

Instead

1. Build an index.

2. Save findings into markdown documents.

3. Reuse those documents.

4. Read source code only when necessary.

5. Work incrementally.

6. Keep context small.

---

# END GOAL

By the end, you should understand this backend well enough that later I can simply say

"Build the MCP server"

and you already know

• the architecture
• every API
• the data flow
• authentication
• business logic
• database
• validations
• models
• services
• workflows

without needing to rediscover the project.

her i want the backend mcp server so the work i have to do manually using fronent which take too much time that can be done by agent automatically
project is referce to the server api or project api (not belong to the apitesting project)

lets i discribe what i will do in short
'''
for every api in project i will create the 10 to 15 or more if can cases
create a folder if not exist for simple like samlicity the folder struture is same as how project store apis in system
example
folder
api
folder
api
api
folder
api
api
folder
api
folder
api
api
folder
api
api

here the folder in postman also create same so understand will easy
here api is file which content it cases (max cases which possible)
for cases creation /Users/aniketmodi/Desktop/api_testing/backend/gpt_test_case_creatio_prompt.txt. use this

after this i upload the cases in system here are many values have to insert manually which can done automatically like token username etcso that can be ask to user

after that run the cases every cases get there response here case creation has expected part which match response structure and if not match expected part this not good here have to do two thing 1) first there can be api response is wrong in that condition api has to change 2) the expected part is wrong build which have to change so althing done correctly

after that i export the table and past in confulnce doc or other docs
'''

i giving this to you to make the master plan to how to make the mcp server by which any agent of api server can connect to this mcp server
for this full understand and reserch and workplan i will use fable model so create the mater promte to give the task to fable
