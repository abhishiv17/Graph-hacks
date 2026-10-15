// Indexes and the ABO lookup graph (statements end with a semicolon)
CREATE INDEX FOR (p:Pair) ON (p.pair_id);
CREATE INDEX FOR (p:Pair) ON (p.status);
CREATE INDEX FOR (l:Loop) ON (l.loop_id);
CREATE INDEX FOR (h:HLAAntigen) ON (h.name);
CREATE INDEX FOR (h:Hospital) ON (h.code);
CREATE INDEX FOR (e:Event) ON (e.seq);
UNWIND ['O','A','B','AB'] AS t MERGE (:BloodGroup {t: t});
UNWIND [['O','O'],['O','A'],['O','B'],['O','AB'],['A','A'],['A','AB'],['B','B'],['B','AB'],['AB','AB']] AS r
MATCH (d:BloodGroup {t: r[0]}), (p:BloodGroup {t: r[1]}) MERGE (d)-[:ABO_OK]->(p)
