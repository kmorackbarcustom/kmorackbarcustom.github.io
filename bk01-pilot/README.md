# KMO BK01 Independent Pilot

> **READ FIRST:** `AGENTS.md` contains mandatory rules for every human or agent modifying this directory.
> This is a KMO-controlled deployment copy. **Do not modify canonical WSTERA BK01 while doing KMO work.**

This directory is a controlled deployment copy of WSTERA BK01 for KMO RACKBARCUSTOM.
It is not the BK01 canonical repository and must not become an independent product fork.

## Ownership
- Source/product upstream: WSTERA BK01
- KMO deployment source: this repository
- Production data/runtime: KMO-owned infrastructure only

## Runtime
- `apps/booking-consumer` — KMO public booking
- `apps/booking-admin` — KMO booking administration
- `supabase/migrations` — imported BK01 database contract pending KMO remote verification

## Required before work
1. Read `AGENTS.md`.
2. Read `UPSTREAM.md` before syncing or classifying generic defects.
3. Read `DEPLOYMENT.md` before any production apply/deploy.
4. Read `KMO_PAYMENT_FLOW.md` before payment-related changes.

The legacy KMO `booking.html` and `bookingdashboard.html` remain untouched until pilot cutover gates pass.
