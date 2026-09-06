# KMO BK01 Independent Pilot

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

## Important
Read `UPSTREAM.md` before syncing upstream changes.
Read `DEPLOYMENT.md` before any production apply/deploy.
The legacy KMO `booking.html` and `bookingdashboard.html` remain untouched until pilot cutover gates pass.
