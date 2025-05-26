package types

type EOSE struct {
	TotalConnections     int `msgpack:"totalConnections"`
	RemainingConnections int `msgpack:"remainingConnections"`
}
