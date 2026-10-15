// Virtual crossmatch: donor antigen <- antibody <- patient, at or above the MFI threshold.
MATCH (:Pair {pair_id: $donor_pair})-[:HAS_DONOR]->(d:Donor), (:Pair {pair_id: $patient_pair})-[:HAS_PATIENT]->(r:Patient)
OPTIONAL MATCH (d)-[:HAS_ANTIGEN]->(h:HLAAntigen)<-[:REACTS_WITH]-(:Antibody)<-[k:HAS_ANTIBODY]-(r)
WHERE k.mfi >= $mfi
RETURN collect({antigen: h.name, mfi: k.mfi}) AS clashes, d.untyped_loci AS untyped_loci
