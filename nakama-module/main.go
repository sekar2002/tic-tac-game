package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/heroiclabs/nakama-common/runtime"
)

// RoomInfo represents a game room available to join
type RoomInfo struct {
	MatchID string `json:"matchId"`
	Mode    string `json:"mode"`
	Players int    `json:"players"`
}

// CreateGameRequest represents the request to create a game
type CreateGameRequest struct {
	Mode string `json:"mode"`
}

// CreateGameResponse represents the response after creating a game
type CreateGameResponse struct {
	Success bool   `json:"success"`
	MatchID string `json:"matchId,omitempty"`
	Error   string `json:"error,omitempty"`
}

// JoinGameRequest represents the request to join a game
type JoinGameRequest struct {
	MatchID interface{} `json:"matchId"` // Can be string or object
}

// JoinGameResponse represents the response after joining a game
type JoinGameResponse struct {
	Success bool   `json:"success"`
	MatchID string `json:"matchId,omitempty"`
	Error   string `json:"error,omitempty"`
}

// ListGamesResponse represents the response for listing games
type ListGamesResponse struct {
	Success bool       `json:"success"`
	Rooms   []RoomInfo `json:"rooms"`
}

// LeaderboardEntry represents a single leaderboard entry
type LeaderboardEntry struct {
	UserID     string `json:"userId"`
	Username   string `json:"username"`
	Wins       int    `json:"wins"`
	Losses     int    `json:"losses"`
	Draws      int    `json:"draws"`
	TotalScore int    `json:"totalScore"`
}

// LeaderboardResponse represents the leaderboard data
type LeaderboardResponse struct {
	Success     bool               `json:"success"`
	Leaderboard []LeaderboardEntry `json:"leaderboard"`
}

// InitModule is the entry point for the Nakama Go runtime module
func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	if err := initializer.RegisterRpc("list_games", listGames); err != nil {
		logger.Error("Unable to register list_games RPC: %v", err)
		return err
	}

	if err := initializer.RegisterRpc("create_game", createGame); err != nil {
		logger.Error("Unable to register create_game RPC: %v", err)
		return err
	}

	if err := initializer.RegisterRpc("join_game", joinGame); err != nil {
		logger.Error("Unable to register join_game RPC: %v", err)
		return err
	}

	if err := initializer.RegisterRpc("get_leaderboard", getLeaderboard); err != nil {
		logger.Error("Unable to register get_leaderboard RPC: %v", err)
		return err
	}

	logger.Info("TicTacToe module initialized successfully")
	return nil
}

// listGames returns available game rooms
func listGames(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	logger.Debug("listGames called")

	rooms := make([]RoomInfo, 0)
	// Note: MatchesList is not available in the runtime API
	// Rooms are managed client-side via WebSocket matchmaker
	// Return empty list - clients should use matchmaker instead

	resp := ListGamesResponse{Success: true, Rooms: rooms}
	result, _ := json.Marshal(resp)
	return string(result), nil
}

// createGame creates a new game room
func createGame(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req CreateGameRequest
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		logger.Error("Error parsing request: %v", err)
		resp := CreateGameResponse{Success: false, Error: "Invalid request"}
		result, _ := json.Marshal(resp)
		return string(result), nil
	}

	if req.Mode == "" {
		req.Mode = "classic"
	}

	matchID, err := nk.MatchCreate(ctx, "tictactoe_"+req.Mode, map[string]interface{}{
		"mode": req.Mode,
	})
	if err != nil {
		logger.Error("Error creating match: %v", err)
		resp := CreateGameResponse{Success: false, Error: "Failed to create game"}
		result, _ := json.Marshal(resp)
		return string(result), nil
	}

	resp := CreateGameResponse{Success: true, MatchID: matchID}
	result, _ := json.Marshal(resp)
	logger.Info("Game created: %s", matchID)
	return string(result), nil
}

// joinGame joins an existing game room
func joinGame(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req JoinGameRequest
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		logger.Error("Error parsing request: %v", err)
		resp := JoinGameResponse{Success: false, Error: "Invalid request: " + err.Error()}
		result, _ := json.Marshal(resp)
		return string(result), nil
	}

	// Handle matchId that could be string or object
	var matchID string
	if req.MatchID != nil {
		switch v := req.MatchID.(type) {
		case string:
			matchID = v
		case map[string]interface{}:
			// If it's an object, extract the value
			if val, ok := v["matchId"].(string); ok {
				matchID = val
			}
		default:
			matchID = fmt.Sprintf("%v", v)
		}
	}

	if matchID == "" {
		resp := JoinGameResponse{Success: false, Error: "Match ID required"}
		result, _ := json.Marshal(resp)
		return string(result), nil
	}

	// Client will join via WebSocket - just validate and return
	resp := JoinGameResponse{Success: true, MatchID: matchID}
	result, _ := json.Marshal(resp)
	return string(result), nil
}

// getLeaderboard returns leaderboard data
func getLeaderboard(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	leaderboard := make([]LeaderboardEntry, 0)

	// Try Nakama's leaderboard system
	records, _, _, _, err := nk.LeaderboardRecordsList(ctx, "tictactoe_scores", nil, 100, "", 0)
	if err != nil {
		logger.Debug("Leaderboard not configured: %v", err)
	} else {
		for _, record := range records {
			username := ""
			if record.Username != nil {
				username = record.Username.Value
			}
			leaderboard = append(leaderboard, LeaderboardEntry{
				UserID:     record.OwnerId,
				Username:   username,
				TotalScore: int(record.Score),
				Wins:       int(record.Score),
			})
		}
	}

	resp := LeaderboardResponse{Success: true, Leaderboard: leaderboard}
	result, _ := json.Marshal(resp)
	return string(result), nil
}
