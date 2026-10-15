// Demo patients, hospital graph: one patient's appointments (past visits, and tentative ones the scheduler held),
// by date. Read-only.
MATCH (:Pair {pair_id: $pair_id})-[:HAS_APPOINTMENT]->(a:Appointment)
RETURN a.appointment_id AS appointment_id, a.kind AS kind, a.status AS status, a.at AS at, a.note AS note,
       a.booked_by AS booked_by, a.task_id AS task_id
ORDER BY at
