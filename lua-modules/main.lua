local nk = require("nakama")

-- Register RPC functions
nk.register_rpc(function(context, payload)
    nk.logger_debug("listGames called")
    return nk.json_encode({ success = true, rooms = {} })
end, "list_games")

nk.register_rpc(function(context, payload)
    local data = nk.json_decode(payload)
    local mode = data.mode or "classic"

    local match_id = nk.match_create("lua_authoritative", { mode = mode })
    if match_id then
        nk.logger_info("Game created: " .. match_id)
        return nk.json_encode({ success = true, matchId = match_id })
    else
        return nk.json_encode({ success = false, error = "Failed to create game" })
    end
end, "create_game")

nk.register_rpc(function(context, payload)
    local data = nk.json_decode(payload)

    local match_id = ""
    if type(data.matchId) == "string" then
        match_id = data.matchId
    elseif type(data.matchId) == "table" and data.matchId.matchId then
        match_id = data.matchId.matchId
    end

    if match_id == "" then
        return nk.json_encode({ success = false, error = "Match ID required" })
    end

    return nk.json_encode({ success = true, matchId = match_id })
end, "join_game")

nk.register_rpc(function(context, payload)
    local leaderboard = {}

    local success, records = pcall(function()
        return nk.leaderboard_records_list("tictactoe_scores", nil, 100)
    end)

    if success and records and records.records then
        for _, record in ipairs(records.records) do
            table.insert(leaderboard, {
                userId = record.owner_id,
                username = record.username or "",
                totalScore = record.score,
                wins = record.score,
                losses = 0,
                draws = 0
            })
        end
    else
        nk.logger_debug("Leaderboard not configured or empty")
    end

    return nk.json_encode({ success = true, leaderboard = leaderboard })
end, "get_leaderboard")

nk.logger_info("TicTacToe Lua module initialized successfully")
