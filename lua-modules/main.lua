local nk = require("nakama")

-- ============================================================
-- RPC Functions (The Server Logic)
-- ============================================================

-- create_game - Creates a new game in storage
local function create_game(context, payload)
    -- Log context for debugging
    nk.logger_info("create_game called - context: " .. nk.json_encode(context or {}))
    nk.logger_info("create_game called - payload: " .. tostring(payload or "nil"))
    
    local ok, data = pcall(nk.json_decode, payload or "{}")
    local mode = "classic"
    if ok and data and data.mode then mode = data.mode end

    -- Generate a short, clean room ID (just the user ID short + timestamp)
    local user_id = context.user_id or "unknown"
    local username = context.username or "unknown_username"
    
    nk.logger_info("create_game - user_id: " .. user_id .. ", context.username: " .. username)
    nk.logger_info("create_game - full context keys: user_id=" .. (context.user_id or "nil") .. ", username=" .. (tostring(context.username) or "nil"))
    
    local user_id_short = user_id:sub(1, 8)
    local match_id = user_id_short .. "_" .. tostring(os.time())

    nk.logger_info("Creating new game with match_id: " .. match_id .. " for user: " .. user_id)

    -- Initial State
    local state = {
        matchId = match_id,
        board = {"", "", "", "", "", "", "", "", ""},
        turn = "X",
        winner = nil,
        players = {
            x_id = context.user_id,
            x_username = context.username or context.user_id:sub(1, 8),
            o_id = nil,
            o_username = nil
        },
        mode = mode,
        createdAt = os.time(),
        timerEndsAt = mode == "timed" and (os.time() + 30) or 0  -- 30 seconds per move
    }

    -- Store in Nakama Storage (Public write so opponent can join)
    local writes = {
        {
            collection = "games",
            key = match_id,
            value = state,
            permission_read = 2, -- Public
            permission_write = 2  -- Public
        }
    }

    nk.storage_write(writes)

    nk.logger_info("Game created successfully: " .. match_id)
    return nk.json_encode({ success = true, matchId = match_id })
end

-- join_game - Join a game
local function join_game(context, payload)
    nk.logger_info("join_game called with payload: " .. (payload or "nil"))
    
    local ok, data = pcall(nk.json_decode, payload or "{}")
    if not ok then
        nk.logger_error("Failed to decode payload: " .. tostring(data))
        return nk.json_encode({ success = false, error = "Invalid payload: " .. tostring(data) })
    end
    
    nk.logger_info("Decoded data: " .. nk.json_encode(data))
    
    local match_id = data.matchId

    if not match_id then
        nk.logger_error("Match ID not provided in request")
        return nk.json_encode({ success = false, error = "Match ID required" })
    end
    
    nk.logger_info("Joining match: " .. tostring(match_id))

    -- Read state
    local reads = {
        { collection = "games", key = match_id }
    }
    local results = nk.storage_read(reads)

    if not results or #results == 0 then
        nk.logger_error("Game not found: " .. tostring(match_id))
        return nk.json_encode({ success = false, error = "Game not found" })
    end

    local state = results[1].value

    -- Assign Player O if slot is open
    if not state.players.o_id and state.players.x_id ~= context.user_id then
        state.players.o_id = context.user_id
        state.players.o_username = context.username or context.user_id:sub(1, 8)
        -- Update storage
        local writes = {
            {
                collection = "games",
                key = match_id,
                value = state,
                permission_read = 2,
                permission_write = 1
            }
        }
        nk.storage_write(writes)
        nk.logger_info("Assigned player O to user: " .. context.user_id)
    end

    return nk.json_encode({ success = true, matchId = match_id })
end

-- Helper: Update player stats after game ends
local function update_player_stats(state, winner_symbol)
    local x_id = state.players.x_id
    local o_id = state.players.o_id
    local timed_out_player = state.timedOutPlayer
    
    -- Get usernames from game state (stored when game was created/joined)
    local x_username = state.players.x_username or x_id:sub(1, 8)
    local o_username = state.players.o_username or o_id:sub(1, 8)

    -- Determine winner, loser, and if it's a draw
    local winner_id = nil
    local loser_id = nil
    local is_draw = (winner_symbol == "draw")

    if not is_draw then
        if winner_symbol == "X" then
            winner_id = x_id
            loser_id = o_id
        else
            winner_id = o_id
            loser_id = x_id
        end
    end

    -- If timed out, the current player (who didn't move) loses
    if timed_out_player then
        if timed_out_player == "X" then
            loser_id = x_id
            winner_id = o_id
        else
            loser_id = o_id
            winner_id = x_id
        end
        is_draw = false
    end

    -- Update stats for each player
    local stats_updates = {}

    -- Helper to update single player stats
    local function update_one_player(player_id, username, is_winner, is_loser, is_draw_game)
        if not player_id or player_id == "" then return end

        -- Read current stats
        local reads = {
            { collection = "player_stats", key = player_id }
        }
        local results = nk.storage_read(reads)

        local stats = {
            username = username,
            wins = 0,
            losses = 0,
            draws = 0,
            totalGames = 0,
            score = 0
        }

        if results and #results > 0 and results[1].value then
            stats = results[1].value
            -- Update username if not set
            if not stats.username then
                stats.username = username
            end
        end

        -- Update stats
        stats.totalGames = stats.totalGames + 1

        if is_winner then
            stats.wins = stats.wins + 1
            stats.score = stats.score + 3  -- 3 points for win
        elseif is_loser then
            stats.losses = stats.losses + 1
            -- 0 points for loss
        elseif is_draw_game then
            stats.draws = stats.draws + 1
            stats.score = stats.score + 1  -- 1 point for draw
        end

        -- Save updated stats
        table.insert(stats_updates, {
            collection = "player_stats",
            key = player_id,
            value = stats,
            permission_read = 2,
            permission_write = 1
        })
    end

    update_one_player(x_id, x_username, winner_id == x_id, loser_id == x_id, is_draw)
    update_one_player(o_id, o_username, winner_id == o_id, loser_id == o_id, is_draw)

    -- Write all stats
    if #stats_updates > 0 then
        nk.storage_write(stats_updates)
        nk.logger_info("Updated player stats for game: " .. state.matchId)
    end
end

-- make_move - VALIDATED SERVER-SIDE MOVE
local function make_move(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    local match_id = data.matchId
    local position = data.position
    local user_id = context.user_id
    
    -- Get the username from context and store it for later use
    local current_username = context.username or user_id:sub(1, 8)

    -- Read state
    local reads = {
        { collection = "games", key = match_id }
    }
    local results = nk.storage_read(reads)

    if not results or #results == 0 then
        return nk.json_encode({ success = false, error = "Game not found" })
    end

    local state = results[1].value

    -- Validation 1: Game over?
    if state.winner then
        return nk.json_encode({ success = false, error = "Game is over" })
    end

    -- Validation 2: Is this player in the game?
    local my_symbol = nil
    if user_id == state.players.x_id then my_symbol = "X"
    elseif user_id == state.players.o_id then my_symbol = "O"
    else
        return nk.json_encode({ success = false, error = "Not a player in this match" })
    end

    -- Validation 3: Is it my turn?
    if state.turn ~= my_symbol then
        return nk.json_encode({ success = false, error = "Not your turn" })
    end

    -- Validation 3.5: Check for timeout (timed mode only)
    if state.mode == "timed" and state.timerEndsAt and state.timerEndsAt > 0 then
        if os.time() > state.timerEndsAt then
            -- Current player timed out - other player wins
            state.winner = (my_symbol == "X") and "O" or "X"
            state.timedOutPlayer = my_symbol
            
            -- Update player stats (timeout = loss)
            update_player_stats(state, state.winner)
            
            local writes = {
                {
                    collection = "games",
                    key = match_id,
                    value = state,
                    permission_read = 2,
                    permission_write = 1
                }
            }
            nk.storage_write(writes)
            nk.logger_info("Player " .. my_symbol .. " timed out. Player " .. state.winner .. " wins!")
            return nk.json_encode({
                success = true,
                state = state,
                timeout = true,
                timedOutPlayer = my_symbol
            })
        end
    end

    -- Validation 4: Position valid? (Client sends 0-8)
    if not position or position < 0 or position > 8 then
        return nk.json_encode({ success = false, error = "Invalid position" })
    end

    -- Lua arrays are 1-indexed, so we add 1
    local board_index = position + 1

    -- Validation 5: Cell empty?
    if state.board[board_index] ~= "" then
        return nk.json_encode({ success = false, error = "Cell already occupied" })
    end

    -- --- APPLY MOVE ---
    state.board[board_index] = my_symbol

    -- Helper: Check winner
    local function check_winner(board)
        local wins = {
            {1, 2, 3}, {4, 5, 6}, {7, 8, 9}, -- Rows
            {1, 4, 7}, {2, 5, 8}, {3, 6, 9}, -- Cols
            {1, 5, 9}, {3, 5, 7}             -- Diagonals
        }
        for _, combo in ipairs(wins) do
            local a, b, c = combo[1], combo[2], combo[3]
            if board[a] ~= "" and board[a] == board[b] and board[b] == board[c] then
                return board[a]
            end
        end
        for _, cell in ipairs(board) do
            if cell == "" then return nil end
        end
        return "draw"
    end

    local winner = check_winner(state.board)
    if winner then
        state.winner = winner
        
        -- Update player stats (win/loss/draw)
        update_player_stats(state, winner)
    else
        state.turn = (my_symbol == "X") and "O" or "X"

        -- Reset timer for next player (timed mode only)
        if state.mode == "timed" then
            state.timerEndsAt = os.time() + 30  -- 30 seconds per move
        end
    end

    -- Update storage
    local writes = {
        {
            collection = "games",
            key = match_id,
            value = state,
            permission_read = 2,
            permission_write = 1
        }
    }
    nk.storage_write(writes)

    -- Return new state
    return nk.json_encode({ success = true, state = state })
end

local function check_timeout(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    local match_id = data.matchId
    if not match_id then
        return nk.json_encode({ success = false, error = "Match ID required" })
    end
    local reads = { { collection = "games", key = match_id } }
    local results = nk.storage_read(reads)
    if not results or #results == 0 then
        return nk.json_encode({ success = false, error = "Game not found" })
    end
    local state = results[1].value

    -- Check if current player timed out (timed mode only)
    if state.mode == "timed" and state.timerEndsAt and state.timerEndsAt > 0 and not state.winner then
        if os.time() > state.timerEndsAt then
            -- Current player timed out - OTHER player wins
            local current_player = state.turn
            local winner_symbol = (current_player == "X") and "O" or "X"
            state.winner = winner_symbol
            state.timedOutPlayer = current_player

            -- Update stats
            update_player_stats(state, winner_symbol)

            -- Save to storage
            local writes = {
                {
                    collection = "games",
                    key = match_id,
                    value = state,
                    permission_read = 2,
                    permission_write = 1
                }
            }
            nk.storage_write(writes)
            nk.logger_info("Timeout check - Player " .. current_player .. " timed out. Player " .. winner_symbol .. " wins!")
            return nk.json_encode({ success = true, state = state, timeout = true, timedOutPlayer = current_player, winner = winner_symbol })
        end
    end

    -- No timeout - return current state
    return nk.json_encode({ success = true, state = state, timedOut = false })
end

local function cleanup_games(context, payload)
    local all_games = nk.storage_list(nil, "games", 200)
    local deleted = 0
    local deletes = {}

    for _, obj in ipairs(all_games) do
        local state = obj.value
        local should_delete = false

        -- Delete if game is over (has winner)
        if state.winner then
            should_delete = true
        end

        -- Delete if creator left before opponent joined (abandoned, instant cleanup)
        if not should_delete and state.abandoned then
            should_delete = true
        end

        -- Delete if only creator exists and no opponent joined (old rule, fallback)
        if not should_delete and state.players and
           state.players.x_id and state.players.x_id ~= "" and
           (not state.players.o_id or state.players.o_id == "") then
            if state.createdAt and (os.time() - state.createdAt) > 300 then
                should_delete = true
            end
        end

        -- Delete if both players left (game has no players)
        if not should_delete and state.players then
            if (not state.players.x_id or state.players.x_id == "") and
               (not state.players.o_id or state.players.o_id == "") then
                should_delete = true
            end
        end

        if should_delete then
            table.insert(deletes, { collection = "games", key = obj.key })
            deleted = deleted + 1
        end
    end

    if #deletes > 0 then
        nk.storage_delete(deletes)
        nk.logger_info("cleanup_games - deleted " .. deleted .. " stale games")
    end

    return nk.json_encode({ success = true, deleted = deleted })
end

local function get_game_state(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    local match_id = data.matchId
    if not match_id then
        return nk.json_encode({ success = false, error = "Match ID required" })
    end
    local reads = { { collection = "games", key = match_id } }
    local results = nk.storage_read(reads)
    if not results or #results == 0 then
        return nk.json_encode({ success = false, error = "Game not found" })
    end
    local state = results[1].value

    -- Check for timeout on every get_game_state call (both players poll this)
    if state.mode == "timed" and state.timerEndsAt and state.timerEndsAt > 0 and not state.winner then
        if os.time() > state.timerEndsAt then
            local current_player = state.turn
            local winner_symbol = (current_player == "X") and "O" or "X"
            state.winner = winner_symbol
            state.timedOutPlayer = current_player

            update_player_stats(state, winner_symbol)

            local writes = {
                {
                    collection = "games",
                    key = match_id,
                    value = state,
                    permission_read = 2,
                    permission_write = 1
                }
            }
            nk.storage_write(writes)
            nk.logger_info("get_game_state - Player " .. current_player .. " timed out. Player " .. winner_symbol .. " wins!")
        end
    end

    return nk.json_encode({ success = true, state = state })
end

local function list_games(context, payload)
    local all_games = nk.storage_list(nil, "games", 100)
    local rooms = {}

    for _, obj in ipairs(all_games) do
        local state = obj.value
        if not state.winner then
            local players_count = 0
            if state.players.x_id and state.players.x_id ~= "" then
                players_count = players_count + 1
            end
            if state.players.o_id and state.players.o_id ~= "" then
                players_count = players_count + 1
            end

            -- Only show rooms waiting for a second player (just creator, no opponent yet)
            if players_count == 1 then
                table.insert(rooms, {
                    id = state.matchId or obj.key,
                    mode = state.mode or "classic",
                    players = players_count,
                    maxSize = 2
                })
            end
        end
    end

    return nk.json_encode({ success = true, rooms = rooms })
end

local function get_leaderboard(context, payload)
    -- Get all player stats from storage
    local all_stats = nk.storage_list(nil, "player_stats", 1000)

    -- Get all usernames from our custom storage
    local all_usernames = nk.storage_list(nil, "usernames", 1000)
    local username_map = {}
    for _, obj in ipairs(all_usernames) do
        username_map[obj.key] = obj.value.username or obj.key:sub(1, 8)
    end

    local leaderboard = {}

    for _, obj in ipairs(all_stats) do
        local player_id = obj.key
        local stats = obj.value

        -- Get username from our storage, fallback to ID
        local username = username_map[player_id] or player_id:sub(1, 8)

        table.insert(leaderboard, {
            userId = player_id,
            username = username,
            wins = stats.wins or 0,
            losses = stats.losses or 0,
            draws = stats.draws or 0,
            totalGames = stats.totalGames or 0,
            score = stats.score or 0
        })
    end

    -- Sort by score (descending)
    table.sort(leaderboard, function(a, b)
        return a.score > b.score
    end)

    -- Add rank
    for i, entry in ipairs(leaderboard) do
        entry.rank = i
    end

    return nk.json_encode({ success = true, leaderboard = leaderboard })
end

-- find_match - Custom matchmaking using storage queue
local function find_match(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    local mode = "classic"
    if ok and data and data.mode then mode = data.mode end

    local user_id = context.user_id
    local action = data.action or "join" -- "join" or "cancel"

    if action == "cancel" then
        -- Remove from queue
        local deletes = {
            { collection = "matchmaking", key = user_id }
        }
        nk.storage_delete(deletes)
        return nk.json_encode({ success = true, status = "cancelled" })
    end

    -- Check if there's an existing waiting player
    -- Try to find any player in queue (not this user)
    local found_match = false
    local matched_opponent_id = nil
    local matched_room_id = nil

    -- List all matchmaking entries to find a waiting player
    local queue_query = nk.storage_list(nil, "matchmaking", 100)
    for _, obj in ipairs(queue_query) do
        local queue_user_id = obj.key
        if queue_user_id ~= user_id and obj.value.status == "waiting" then
            -- Found a waiting player! Create a game for both
            matched_opponent_id = queue_user_id
            found_match = true
            break
        end
    end

    if found_match and matched_opponent_id then
        -- Create a new game with both players
        local match_id = user_id:sub(1, 8) .. "_" .. os.time()
        local state = {
            matchId = match_id,
            board = {"", "", "", "", "", "", "", "", ""},
            turn = "X",
            winner = nil,
            players = {
                x_id = user_id, -- First player is X
                o_id = matched_opponent_id
            },
            mode = mode,
            createdAt = os.time(),
            timerEndsAt = mode == "timed" and (os.time() + 30) or 0  -- 30 seconds per move
        }

        -- Store the game
        local writes = {
            {
                collection = "games",
                key = match_id,
                value = state,
                permission_read = 2,
                permission_write = 1
            }
        }
        nk.storage_write(writes)

        -- Remove both from queue
        local deletes = {
            { collection = "matchmaking", key = user_id },
            { collection = "matchmaking", key = matched_opponent_id }
        }
        nk.storage_delete(deletes)

        -- Update both players' status
        local status_writes = {
            {
                collection = "matchmaking_status",
                key = user_id,
                value = { status = "matched", matchId = match_id, role = "X", opponent = matched_opponent_id },
                permission_read = 2,
                permission_write = 1
            },
            {
                collection = "matchmaking_status",
                key = matched_opponent_id,
                value = { status = "matched", matchId = match_id, role = "O", opponent = user_id },
                permission_read = 2,
                permission_write = 1
            }
        }
        nk.storage_write(status_writes)

        nk.logger_info("Match found: " .. user_id .. " vs " .. matched_opponent_id .. " in room " .. match_id)
        return nk.json_encode({
            success = true,
            matched = true,
            matchId = match_id,
            role = "X",
            opponent = matched_opponent_id
        })
    else
        -- No match found, add to queue
        local status = "waiting"
        local match_id = nil

        local writes = {
            {
                collection = "matchmaking",
                key = user_id,
                value = { user_id = user_id, mode = mode, status = status, timestamp = os.time() },
                permission_read = 2,
                permission_write = 2
            },
            {
                collection = "matchmaking_status",
                key = user_id,
                value = { status = status, mode = mode, timestamp = os.time() },
                permission_read = 2,
                permission_write = 1
            }
        }
        nk.storage_write(writes)

        nk.logger_info("Player " .. user_id .. " added to matchmaking queue")
        return nk.json_encode({
            success = true,
            matched = false,
            status = "waiting"
        })
    end
end

-- check_match_status - Poll to see if player has been matched
local function check_match_status(context, payload)
    local user_id = context.user_id
    local reads = {
        { collection = "matchmaking_status", key = user_id }
    }
    local results = nk.storage_read(reads)

    if results and #results > 0 then
        local status_data = results[1].value
        return nk.json_encode({
            success = true,
            status = status_data.status,
            matchId = status_data.matchId or nil,
            role = status_data.role or nil,
            opponent = status_data.opponent or nil
        })
    end

    return nk.json_encode({ success = true, status = "unknown" })
end

-- ============================================================
-- Registration
-- ============================================================

-- store_username - Store user's chosen username
local function store_username(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    if not ok then
        return nk.json_encode({ success = false, error = "Invalid request" })
    end

    local username = data.username
    local user_id = data.userId or context.user_id

    if not username or username == "" then
        return nk.json_encode({ success = false, error = "Username required" })
    end

    -- Store in a dedicated collection
    local writes = {
        {
            collection = "usernames",
            key = user_id,
            value = { username = username, user_id = user_id },
            permission_read = 2,
            permission_write = 1
        }
    }

    nk.storage_write(writes)
    nk.logger_info("Stored username: " .. username .. " for user: " .. user_id)

    return nk.json_encode({ success = true, username = username })
end

-- update_username - Update the user's username in their account (admin only)
local function update_username(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    if not ok then
        return nk.json_encode({ success = false, error = "Invalid request" })
    end

    local new_username = data.username
    if not new_username or new_username == "" then
        return nk.json_encode({ success = false, error = "Username required" })
    end

    local user_id = context.user_id

    -- Store the username in our custom collection
    local writes = {
        {
            collection = "usernames",
            key = user_id,
            value = { username = new_username, user_id = user_id },
            permission_read = 2,
            permission_write = 1
        }
    }

    nk.storage_write(writes)
    nk.logger_info("Updated username for user " .. user_id .. " to: " .. new_username)
    return nk.json_encode({ success = true, username = new_username })
end

-- leave_game - Player explicitly leaves a game
local function leave_game(context, payload)
    local ok, data = pcall(nk.json_decode, payload or "{}")
    local match_id = data.matchId
    local user_id = context.user_id

    if not match_id then
        return nk.json_encode({ success = false, error = "Match ID required" })
    end

    local reads = { { collection = "games", key = match_id } }
    local results = nk.storage_read(reads)

    if not results or #results == 0 then
        return nk.json_encode({ success = false, error = "Game not found" })
    end

    local state = results[1].value

    -- Game already over?
    if state.winner then
        return nk.json_encode({ success = true, alreadyOver = true, winner = state.winner })
    end

    -- Identify which player is leaving
    local leaving_player = nil
    local staying_player = nil
    if user_id == state.players.x_id then
        leaving_player = "X"
        staying_player = "O"
    elseif user_id == state.players.o_id then
        leaving_player = "O"
        staying_player = "X"
    else
        return nk.json_encode({ success = false, error = "Not a player in this match" })
    end

    -- If only one player has joined (creator waiting), just mark them as left
    if staying_player == "O" and (not state.players.o_id or state.players.o_id == "") then
        -- Creator leaving before anyone joined — mark for immediate cleanup
        state.players.x_id = ""
        state.players.x_username = ""
        state.abandoned = true
        state.leftAt = os.time()

        local writes = {
            {
                collection = "games",
                key = match_id,
                value = state,
                permission_read = 2,
                permission_write = 1
            }
        }
        nk.storage_write(writes)
        nk.logger_info("Creator left before opponent joined, game marked abandoned: " .. match_id)
        return nk.json_encode({ success = true, abandoned = true })
    end

    -- Both players were in the game — staying player wins by forfeit
    state.winner = staying_player
    state.abandoned = true
    state.leftAt = os.time()
    state.leftBy = leaving_player

    -- Update stats: staying player gets win (3 pts), leaving player gets loss
    update_player_stats(state, staying_player)

    local writes = {
        {
            collection = "games",
            key = match_id,
            value = state,
            permission_read = 2,
            permission_write = 1
        }
    }
    nk.storage_write(writes)

    nk.logger_info("Player " .. leaving_player .. " left. Player " .. staying_player .. " wins by forfeit: " .. match_id)
    return nk.json_encode({ success = true, winner = staying_player, forfeit = true })
end

nk.register_rpc(create_game, "create_game")
nk.register_rpc(join_game, "join_game")
nk.register_rpc(make_move, "make_move")
nk.register_rpc(get_game_state, "get_game_state")
nk.register_rpc(check_timeout, "check_timeout")
nk.register_rpc(list_games, "list_games")
nk.register_rpc(cleanup_games, "cleanup_games")
nk.register_rpc(get_leaderboard, "get_leaderboard")
nk.register_rpc(find_match, "find_match")
nk.register_rpc(check_match_status, "check_match_status")
nk.register_rpc(store_username, "store_username")
nk.register_rpc(update_username, "update_username")
nk.register_rpc(leave_game, "leave_game")

nk.logger_info("TicTacToe Lua RPC Server initialized")
