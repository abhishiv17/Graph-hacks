// Agent memory, persona graph: one swap search the agents ran for this patient, at one depth (2 = 2-way only,
// 3 = 2-way and 3-way), with how many loops it found and the best ones. Kept so a shallow search can be compared with
// a deeper one, week by week.
MATCH (me:Person {persona_id: $persona_id})
CREATE (me)-[:SEARCHED]->(s:Search {search_id: $search_id, at: $at, week: $week, depth: $depth, found: $found,
                                    total: $total, loops: $loops, by: $by, created: timestamp()})
RETURN s.search_id AS search_id
