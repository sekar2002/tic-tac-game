import { Injectable, EventEmitter } from '@angular/core';

export interface GameState {
  board: string[];
  currentTurn: string;
  playerX: string;
  playerO: string;
  winner: string;
  mode: string;
  timerEndsAt: number;
  createdAt: number;
}

export interface RoomInfo {
  id: string;
  mode: string;
  players: number;
  maxSize: number;
}

export interface LeaderboardRecord {
  owner: string;
  username: string;
  score: number;
  rank: number;
  maxNumScore: number;
  numScore: number;
}

@Injectable({
  providedIn: 'root'
})
export class NakamaService {
  private client: any = null;
  private socket: any = null;
  private session: any = null;
  public match: any = null;
  public gameState: any = null;
  private matchmakerTicket: string | null = null;
  private serverKey = 'defaulthttpkey';
  private host = '';  // Use relative URL through proxy
  private port = '';
  private useSSL = false;

  // Event emitters for real-time updates
  onGameStateUpdate = new EventEmitter<GameState>();
  onMatchJoined = new EventEmitter<string>();
  onMatchPresence = new EventEmitter<any>();
  onMatchmakerMatched = new EventEmitter<any>();
  onError = new EventEmitter<string>();

  get isLoggedIn(): boolean {
    return this.session !== null;
  }

  get currentSession(): any {
    return this.session;
  }

  async authenticate(username: string, password?: string): Promise<boolean> {
    try {
      // Use default server key for authentication
      const serverKey = 'defaultkey';
      const credentials = btoa(`${serverKey}:`);

      // Use a CONSISTENT device ID based on username (not timestamp)
      // This ensures the same username always maps to the same account
      const deviceId = `device_${username.toLowerCase().trim()}`;

      const apiUrl = '/v2/account/authenticate/device?create=true';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: deviceId,
          username: username.toLowerCase().trim()  // Ensure consistent username
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Auth] Server response:', errorText);
        throw new Error('Authentication failed');
      }

      const data = await response.json();
      this.session = data;

      // Nakama returns { token, refresh_token, created } - user info is inside the JWT token
      // Decode JWT to extract user ID
      const tokenParts = this.session.token.split('.');
      if (tokenParts.length !== 3) {
        console.error('[Auth] Invalid JWT token:', this.session);
        throw new Error('Invalid authentication token');
      }

      // Decode payload (base64url)
      const payload = tokenParts[1];
      const decodedPayload = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));

      console.log('[Auth] Decoded token:', decodedPayload);

      // Nakama JWT contains: { uid, usn (username), tid (session), exp }
      this.session.user = {
        id: decodedPayload.uid || '',
        username: decodedPayload.usn || username
      };

      console.log('[Auth] Authenticated successfully - userId:', this.session.user.id, 'username:', this.session.user.username);

      // IMPORTANT: Nakama device auth generates random usernames. 
      // Store the correct username in our own storage collection via RPC
      await this.saveUsernameToStorage(username.toLowerCase().trim());

      // Update the session username
      this.session.user.username = username.toLowerCase().trim();

      console.log('[Auth] Username saved to storage:', this.session.user.username);

      // Connect socket
      await this.connectSocket();

      return true;
    } catch (error: any) {
      console.error('[Auth] Authentication error:', error);
      return false;
    }
  }

  // Save username to Nakama storage via RPC
  private async saveUsernameToStorage(username: string): Promise<void> {
    try {
      await this.rpcCall('store_username', { 
        username: username,
        userId: this.session.user.id 
      });
    } catch (error) {
      console.error('[Auth] Failed to save username:', error);
    }
  }

  async connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.getWebSocketUrl();
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('WebSocket connected');
        this.socket = socket;
        resolve();
      };

      socket.onmessage = (event: MessageEvent) => {
        this.handleSocketMessage(event.data);
      };

      socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.socket = null;
      };

      socket.onerror = (error: any) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

   removeMatchmaker(): void {
    if (this.matchmakerTicket && this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        matchmaker_remove: { ticket: this.matchmakerTicket }
      }));
      this.matchmakerTicket = null;
    }
  }
  private handleSocketMessage(data: string): void {
    try {
      const envelope = JSON.parse(data);

      console.log('RECEIVED:', Object.keys(envelope).join(', '));

      if (envelope.match_data) {
        const matchData = envelope.match_data;
        console.log('MATCH DATA:', matchData);
        const parsedData = JSON.parse(atob(matchData.data));
        console.log('PARSED MATCH DATA:', parsedData);

        if (matchData.op_code === 1 || matchData.op_code === '1') {
          console.log('EMITTING GAME STATE UPDATE:', parsedData);
          this.onGameStateUpdate.emit(parsedData);
        }
        if (matchData.op_code === 2 || matchData.op_code === '2') {
          this.onError.emit(parsedData.message);
        }
      }

      if (envelope.matchmaker_ticket) {
        this.matchmakerTicket = envelope.matchmaker_ticket.ticket;
      }

      if (envelope.matchmaker_matched) {
        const matched = envelope.matchmaker_matched;
        const cleanMatchId = 'matched_' + Date.now();
        
        console.log('[Nakama] Matchmaker matched:', matched);
        
        // Determine roles: first user in list is X (creator), second is O (joiner)
        const users = matched.users || [];
        const myPresence = matched.self?.presence;
        const myIndex = users.findIndex((u: any) => u.presence?.user_id === myPresence?.user_id);
        const isPlayerX = myIndex === 0 || myIndex === -1;

        this.match = {
          match_id: cleanMatchId,
          match_id_clean: cleanMatchId,
          size: users.length,
          self: matched.self,
          isPlayerX: isPlayerX,
          isMatchmaking: true
        };
        
        console.log('[Nakama] Matchmaker - isPlayerX:', isPlayerX, 'users:', users.length);
        
        // Join the relay if token is provided
        if (matched.token && this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ match_join: { token: matched.token } }));
        }
        
        // Emit match found event with all data
        this.onMatchmakerMatched.emit({
          matchId: cleanMatchId,
          token: matched.token,
          users: users,
          isPlayerX: isPlayerX
        });
      }

      if (envelope.match) {
        const rawMatchId = envelope.match.match_id;
        const cleanMatchId = rawMatchId.replace(/\.$/, '');
        // Preserve size=2 from matchmaker
        const newSize = this.match?.size === 2 ? 2 : 2;
        // CRITICAL: Preserve isPlayerX value
        const existingIsPlayerX = this.match?.isPlayerX;
        this.match = {
          match_id: rawMatchId,
          match_id_clean: cleanMatchId,
          size: newSize,
          self: envelope.match.self,
          isPlayerX: existingIsPlayerX !== undefined ? existingIsPlayerX : false
        };
        console.log('[Nakama] envelope.match - matchId:', cleanMatchId, 'isPlayerX:', this.match.isPlayerX);
        this.onMatchJoined.emit(cleanMatchId);
      }

      if (envelope.match_presence_event) {
        const event = envelope.match_presence_event;
        const cleanEventMatchId = event.match_id.replace(/\.$/, '');

        if (event.joins && event.joins.length > 0) {
          if (this.match && this.match.match_id_clean === cleanEventMatchId) {
            this.match.size = (this.match.size || 0) + event.joins.length;
          }
          this.onMatchJoined.emit(cleanEventMatchId);
        }

        if (event.leaves && event.leaves.length > 0) {
          if (this.match && this.match.match_id_clean === cleanEventMatchId) {
            this.match.size = Math.max(0, (this.match.size || 0) - event.leaves.length);
          }
        }

        // Emit match presence event for detailed handling
        this.onMatchPresence.emit({
          matchId: cleanEventMatchId,
          joins: event.joins || [],
          leaves: event.leaves || []
        });
      }
    } catch (error) {
      console.error('Error handling socket message:', error);
    }
  }

  async createGame(mode: string = 'classic'): Promise<any> {
    return this.rpcCall('create_game', { mode });
  }

  async joinGame(matchId: string): Promise<any> {
    console.log('joinGame called with matchId:', matchId);
    return this.rpcCall('join_game', { matchId });
  }

  async makeMove(matchId: string, position: number): Promise<any> {
    return this.rpcCall('make_move', { matchId, position });
  }

  async getGameState(matchId: string): Promise<any> {
    return this.rpcCall('get_game_state', { matchId });
  }

  async checkTimeout(matchId: string): Promise<any> {
    return this.rpcCall('check_timeout', { matchId });
  }

  async listGames(): Promise<{ success: boolean; rooms: RoomInfo[] }> {
    return this.rpcCall('list_games', {});
  }

  async cleanupGames(): Promise<any> {
    return this.rpcCall('cleanup_games', {});
  }

  async leaveGame(matchId: string): Promise<any> {
    return this.rpcCall('leave_game', { matchId });
  }

  // Matchmaking methods (RPC-based)
  async findMatch(mode: string = 'classic'): Promise<any> {
    return this.rpcCall('find_match', { mode, action: 'join' });
  }

  async cancelMatchmaker(): Promise<any> {
    return this.rpcCall('find_match', { action: 'cancel' });
  }

  async checkMatchStatus(): Promise<any> {
    return this.rpcCall('check_match_status', {});
  }

  async getLeaderboard(): Promise<any> {
    return this.rpcCall('get_leaderboard', {});
  }

  private async rpcCall(id: string, payload: any): Promise<any> {
    // Don't use http_key for user-authenticated RPCs - use Bearer token only
    const apiUrl = `/v2/rpc/${id}`;
    // Nakama RPC handlers expect double-encoded JSON:
    // - Inner encoding: {matchId: "abc"} -> '{"matchId":"abc"}'
    // - Outer encoding: wraps it again for HTTP transport
    const rpcPayload = JSON.stringify(JSON.stringify(payload));

    console.log(`RPC ${id} - Sending:`, rpcPayload);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.session.token}`,
        'Content-Type': 'application/json'
      },
      body: rpcPayload
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`RPC ${id} failed:`, errorText);
      throw new Error(`RPC ${id} failed: ${errorText}`);
    }

    const result = await response.json();
    console.log(`RPC ${id} - Response:`, result);
    if (result.payload) {
      return JSON.parse(result.payload);
    }
    return result;
  }

  sendMatchmakerAdd(properties: any): string {
    const message = {
      matchmaker_add: {
        query: '*',
        min_count: 2,
        max_count: 2,
        string_properties: properties
      }
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return 'ticket_sent';
    }

    throw new Error('Socket not connected');
  }

  private sendMatchData(matchId: string, opCode: number, data: string): void {
    const message = {
      match_data_send: {
        match_id: matchId,
        op_code: opCode,
        data: btoa(data)
      }
    };

    console.log('SEND MATCH DATA:', message, 'SOCKET STATE:', this.socket?.readyState);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      console.log('DATA SENT TO NAKAMA');
    } else {
      console.error('SOCKET NOT OPEN, STATE:', this.socket?.readyState);
    }
  }

  joinMatchById(matchId: string): void {
    const apiMatchId = matchId.endsWith('.') ? matchId : matchId + '.';
    const message = {
      match_join: {
        id: apiMatchId
      }
    };

    // Preserve existing isPlayerX value if already set (e.g., by creator)
    const existingIsPlayerX = this.match?.isPlayerX;
    this.match = {
      match_id: apiMatchId,
      match_id_clean: matchId,
      size: 2,
      self: null,
      isPlayerX: existingIsPlayerX !== undefined ? existingIsPlayerX : false
    };

    console.log('[Nakama] joinMatchById - matchId:', matchId, 'isPlayerX:', this.match.isPlayerX);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  // Create a game room via RPC
  createRelayedMatch(): void {
    this.createGame('classic').then(res => {
      if (res.success && res.matchId) {
        this.onMatchJoined.emit(res.matchId);
      }
    });
  }

  private getApiUrl(path: string): string {
    // Use relative URL through Angular proxy
    return path;
  }

  private getWebSocketUrl(): string {
    const protocol = this.useSSL ? 'wss' : 'ws';
    const token = this.session.token;
    return `${protocol}://localhost:7350/ws?lang=en&status=true&token=${token}`;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.session = null;
  }
}
