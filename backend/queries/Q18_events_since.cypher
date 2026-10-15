// The "What the agents are doing" feed.
MATCH (e:Event) WHERE e.seq > $since
RETURN e.seq AS seq, e.at AS at, e.agent AS agent, e.text AS text, e.kind AS kind
ORDER BY e.seq LIMIT 200
