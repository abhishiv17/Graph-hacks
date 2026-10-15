// Agent memory, persona graph: store what the health watch noticed, linked to the readings it used (mirrored from
// the hospital graph by id) and to the playbook it triggered, if the stage changed.
MATCH (me:Person {persona_id: $persona_id})
CREATE (me)-[:HAS_FINDING]->(f:Finding {finding_id: $finding_id, at: $at, week: $week, kind: $kind, stage: $stage,
                                         previous_stage: $previous_stage, text: $text, value: $value,
                                         slope_per_year: $slope_per_year, weeks_to_next: $weeks_to_next})
WITH me, f
UNWIND $readings AS rd
MERGE (r:Reading {result_id: rd.result_id}) SET r.value = rd.value, r.at = rd.at
CREATE (f)-[:BASED_ON]->(r)
WITH DISTINCT me, f
OPTIONAL MATCH (me)-[:FOLLOWS]->(pb:Playbook {stage: $triggered})
FOREACH (x IN CASE WHEN pb IS NULL THEN [] ELSE [pb] END | CREATE (f)-[:TRIGGERED]->(x))
RETURN f.finding_id AS finding_id
