import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type MessageEditOptions
} from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";
import { DiscordLoveFeature } from "./DiscordLoveFeature.js";

type MinesweeperDifficulty = "Easy" | "Medium" | "Hard";
type MinesweeperStatus = "Playing" | "Won" | "Lost" | "TimedOut";
type TicTacToeDifficulty = "Easy" | "Medium" | "Impossible";
type TicTacToeStatus = "Playing" | "PlayerWon" | "BotWon" | "Draw" | "TimedOut";
type TicTacToeCell = "Empty" | "Player" | "Bot";

type MinesweeperConfig = {
  MinesweeperTitle: string;
  MinesweeperDescription: string;
  MinesweeperWinMessage: string;
  MinesweeperLoseMessage: string;
  MinesweeperTimeoutMessage: string;
  MinesweeperUnauthorizedMessage: string;
  MinesweeperOnlyCreator: boolean;
  MinesweeperColor: string;
  MinesweeperWinColor: string;
  MinesweeperLoseColor: string;
  MinesweeperTimeoutColor: string;
  HiddenTileEmoji: string;
  EmptyTileEmoji: string;
  MineEmoji: string;
  NumberEmojis: string[];
};

type TicTacToeConfig = {
  TicTacToeTitle: string;
  TicTacToeDescription: string;
  TicTacToeWinMessage: string;
  TicTacToeLoseMessage: string;
  TicTacToeDrawMessage: string;
  TicTacToeTimeoutMessage: string;
  TicTacToeUnauthorizedMessage: string;
  TicTacToeColor: string;
  TicTacToeWinColor: string;
  TicTacToeLoseColor: string;
  TicTacToeDrawColor: string;
  TicTacToeTimeoutColor: string;
  TicTacToePlayerEmoji: string;
  TicTacToeBotEmoji: string;
  TicTacToeEmptyLabel: string;
};

type MinesweeperSession = {
  GuildId: string;
  ChannelId: string;
  MessageId: string;
  PlayerId: string;
  PlayerTag: string;
  Difficulty: MinesweeperDifficulty;
  MineIndexes: number[];
  RevealedIndexes: number[];
  Status: MinesweeperStatus;
  CreatedAt: string;
  LastInputAt: number;
};

type MinesweeperSessions = Record<string, MinesweeperSession>;

type TicTacToeSession = {
  GuildId: string;
  ChannelId: string;
  MessageId: string;
  PlayerId: string;
  PlayerTag: string;
  Difficulty: TicTacToeDifficulty;
  Board: TicTacToeCell[];
  Status: TicTacToeStatus;
  CreatedAt: string;
  LastInputAt: number;
};

type TicTacToeSessions = Record<string, TicTacToeSession>;

const GridSize = 5;
const TileCount = GridSize * GridSize;
const SessionsStorageKey = "MinesweeperSessions";
const TicTacToeSessionsStorageKey = "TicTacToeSessions";
const DifficultyMineCounts: Record<MinesweeperDifficulty, number> = {
  Easy: 3,
  Medium: 5,
  Hard: 7
};

const DefaultConfig: MinesweeperConfig = {
  MinesweeperTitle: "Minesweeper - %difficulty%",
  MinesweeperDescription: "Reveal every safe tile without clicking a mine. Mines: %mines%",
  MinesweeperWinMessage: "%user% cleared the minefield.",
  MinesweeperLoseMessage: "%user% clicked a mine.",
  MinesweeperTimeoutMessage: "This Minesweeper game timed out after 5 minutes without input.",
  MinesweeperUnauthorizedMessage: "Only %user% can play this Minesweeper game.",
  MinesweeperOnlyCreator: true,
  MinesweeperColor: "#5865f2",
  MinesweeperWinColor: "#22c55e",
  MinesweeperLoseColor: "#ef4444",
  MinesweeperTimeoutColor: "#64748b",
  HiddenTileEmoji: "​",
  EmptyTileEmoji: "​",
  MineEmoji: "💣",
  NumberEmojis: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
};

const DefaultTicTacToeConfig: TicTacToeConfig = {
  TicTacToeTitle: "Tic-Tac-Toe - %difficulty%",
  TicTacToeDescription: "%user% plays as %playerEmoji%. Bot plays as %botEmoji%.",
  TicTacToeWinMessage: "%user% won against the bot.",
  TicTacToeLoseMessage: "The bot won this game.",
  TicTacToeDrawMessage: "This Tic-Tac-Toe game ended in a draw.",
  TicTacToeTimeoutMessage: "This Tic-Tac-Toe game timed out after 5 minutes without input.",
  TicTacToeUnauthorizedMessage: "Only %user% can play this Tic-Tac-Toe game.",
  TicTacToeColor: "#5865f2",
  TicTacToeWinColor: "#22c55e",
  TicTacToeLoseColor: "#ef4444",
  TicTacToeDrawColor: "#f59e0b",
  TicTacToeTimeoutColor: "#64748b",
  TicTacToePlayerEmoji: "❌",
  TicTacToeBotEmoji: "⭕",
  TicTacToeEmptyLabel: "​"
};

export default class DiscordGamePlugin extends BasePlugin {
  private readonly LoveFeature = new DiscordLoveFeature(this.Storage, this.Logger);

  public async OnEnable(): Promise<void> {
    this.Logger.Info("Discord Game plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Discord Game plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, InteractionValue: ChatInputCommandInteraction): Promise<void> {
    if (CommandName === "love") {
      await this.LoveFeature.HandleLoveCommand(InteractionValue);
      return;
    }

    if (CommandName === "tictactoe") {
      await this.HandleTicTacToeCommand(InteractionValue);
      return;
    }

    if (CommandName !== "minesweeper") {
      return;
    }

    if (!InteractionValue.guildId) {
      await InteractionValue.reply({ content: "This game can only be started in a server.", ephemeral: true });
      return;
    }

    const Difficulty = this.ParseDifficulty(InteractionValue.options.getString("difficulty", true));
    const Config = await this.GetConfig(InteractionValue.guildId);
    const MineIndexes = this.GenerateMineIndexes(DifficultyMineCounts[Difficulty]);
    const Session: MinesweeperSession = {
      GuildId: InteractionValue.guildId,
      ChannelId: InteractionValue.channelId,
      MessageId: "",
      PlayerId: InteractionValue.user.id,
      PlayerTag: InteractionValue.user.tag,
      Difficulty,
      MineIndexes,
      RevealedIndexes: [this.GetRandomSafeTileIndex(MineIndexes)],
      Status: "Playing",
      CreatedAt: new Date().toISOString(),
      LastInputAt: Date.now()
    };

    await InteractionValue.reply({
      embeds: [this.BuildEmbed(Session, Config)],
      components: this.BuildComponents(Session, Config)
    });

    const MessageValue = await InteractionValue.fetchReply();
    Session.MessageId = MessageValue.id;
    await this.SaveSession(Session);
    await MessageValue.edit({
      embeds: [this.BuildEmbed(Session, Config)],
      components: this.BuildComponents(Session, Config)
    });
  }

  public async OnInteraction(InteractionValue: Interaction): Promise<void> {
    if (!InteractionValue.isButton()) {
      return;
    }

    if (InteractionValue.customId.startsWith("DiscordGame:Minesweeper:")) {
      await this.HandleMinesweeperButton(InteractionValue);
      return;
    }

    if (InteractionValue.customId.startsWith("DiscordGame:TicTacToe:")) {
      await this.HandleTicTacToeButton(InteractionValue);
    }
  }

  public async OnTick(): Promise<void> {
    const Now = Date.now();

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Sessions = await this.GetSessions(Guild.id);

      for (const Session of Object.values(Sessions)) {
        if (Session.Status !== "Playing" || !this.IsSessionTimedOut(Session, Now)) {
          continue;
        }

        Session.Status = "TimedOut";
        await this.SaveSession(Session);
        await this.EditGameMessage(Session);
      }
    }

    for (const Guild of this.DiscordClient.guilds.cache.values()) {
      const Sessions = await this.GetTicTacToeSessions(Guild.id);

      for (const Session of Object.values(Sessions)) {
        if (Session.Status !== "Playing" || !this.IsTicTacToeTimedOut(Session, Now)) {
          continue;
        }

        Session.Status = "TimedOut";
        await this.SaveTicTacToeSession(Session);
        await this.EditTicTacToeMessage(Session);
      }
    }
  }

  private async HandleMinesweeperButton(InteractionValue: ButtonInteraction): Promise<void> {
    const [, , MessageId, TileIndexValue] = InteractionValue.customId.split(":");
    const TileIndex = Number(TileIndexValue);

    if (!InteractionValue.guildId || !MessageId || !Number.isInteger(TileIndex)) {
      return;
    }

    const Session = await this.GetSession(InteractionValue.guildId, MessageId);

    if (!Session) {
      await InteractionValue.reply({ content: "This Minesweeper game no longer exists.", ephemeral: true });
      return;
    }

    const Config = await this.GetConfig(InteractionValue.guildId);

    if (Config.MinesweeperOnlyCreator && InteractionValue.user.id !== Session.PlayerId) {
      await InteractionValue.reply({
        content: this.ApplyTemplate(Config.MinesweeperUnauthorizedMessage, Session, Config),
        ephemeral: true
      });
      return;
    }

    if (this.IsSessionTimedOut(Session, Date.now())) {
      Session.Status = "TimedOut";
      await this.SaveSession(Session);
      await InteractionValue.update({
        embeds: [this.BuildEmbed(Session, Config)],
        components: this.BuildComponents(Session, Config)
      });
      return;
    }

    if (Session.Status !== "Playing" || Session.RevealedIndexes.includes(TileIndex)) {
      await InteractionValue.deferUpdate();
      return;
    }

    Session.LastInputAt = Date.now();

    if (Session.MineIndexes.includes(TileIndex)) {
      Session.Status = "Lost";
      Session.RevealedIndexes = Array.from(new Set([...Session.RevealedIndexes, ...Array.from({ length: TileCount }, (_, Index) => Index)]));
    } else {
      Session.RevealedIndexes = this.RevealSafeTiles(Session, TileIndex);

      if (this.HasWon(Session)) {
        Session.Status = "Won";
        Session.RevealedIndexes = Array.from({ length: TileCount }, (_, Index) => Index);
      }
    }

    await this.SaveSession(Session);
    await InteractionValue.update({
      embeds: [this.BuildEmbed(Session, Config)],
      components: this.BuildComponents(Session, Config)
    });
  }

  private async HandleTicTacToeCommand(InteractionValue: ChatInputCommandInteraction): Promise<void> {
    if (!InteractionValue.guildId) {
      await InteractionValue.reply({ content: "This game can only be started in a server.", ephemeral: true });
      return;
    }

    const Difficulty = this.ParseTicTacToeDifficulty(InteractionValue.options.getString("difficulty", true));
    const Config = await this.GetTicTacToeConfig(InteractionValue.guildId);
    const Session: TicTacToeSession = {
      GuildId: InteractionValue.guildId,
      ChannelId: InteractionValue.channelId,
      MessageId: "",
      PlayerId: InteractionValue.user.id,
      PlayerTag: InteractionValue.user.tag,
      Difficulty,
      Board: Array.from({ length: 9 }, () => "Empty"),
      Status: "Playing",
      CreatedAt: new Date().toISOString(),
      LastInputAt: Date.now()
    };

    await InteractionValue.reply({
      embeds: [this.BuildTicTacToeEmbed(Session, Config)],
      components: this.BuildTicTacToeComponents(Session, Config)
    });

    const MessageValue = await InteractionValue.fetchReply();
    Session.MessageId = MessageValue.id;
    await this.SaveTicTacToeSession(Session);
    await MessageValue.edit({
      embeds: [this.BuildTicTacToeEmbed(Session, Config)],
      components: this.BuildTicTacToeComponents(Session, Config)
    });
  }

  private async HandleTicTacToeButton(InteractionValue: ButtonInteraction): Promise<void> {
    const [, , MessageId, CellIndexValue] = InteractionValue.customId.split(":");
    const CellIndex = Number(CellIndexValue);

    if (!InteractionValue.guildId || !MessageId || !Number.isInteger(CellIndex)) {
      return;
    }

    const Session = await this.GetTicTacToeSession(InteractionValue.guildId, MessageId);

    if (!Session) {
      await InteractionValue.reply({ content: "This Tic-Tac-Toe game no longer exists.", ephemeral: true });
      return;
    }

    const Config = await this.GetTicTacToeConfig(InteractionValue.guildId);

    if (InteractionValue.user.id !== Session.PlayerId) {
      await InteractionValue.reply({
        content: this.ApplyTicTacToeTemplate(Config.TicTacToeUnauthorizedMessage, Session, Config),
        ephemeral: true
      });
      return;
    }

    if (this.IsTicTacToeTimedOut(Session, Date.now())) {
      Session.Status = "TimedOut";
      await this.SaveTicTacToeSession(Session);
      await InteractionValue.update({
        embeds: [this.BuildTicTacToeEmbed(Session, Config)],
        components: this.BuildTicTacToeComponents(Session, Config)
      });
      return;
    }

    if (Session.Status !== "Playing" || Session.Board[CellIndex] !== "Empty") {
      await InteractionValue.deferUpdate();
      return;
    }

    Session.LastInputAt = Date.now();
    Session.Board[CellIndex] = "Player";
    this.UpdateTicTacToeStatus(Session);

    if (Session.Status === "Playing") {
      const BotMove = this.GetBotMove(Session);

      if (BotMove !== null) {
        Session.Board[BotMove] = "Bot";
      }

      this.UpdateTicTacToeStatus(Session);
    }

    await this.SaveTicTacToeSession(Session);
    await InteractionValue.update({
      embeds: [this.BuildTicTacToeEmbed(Session, Config)],
      components: this.BuildTicTacToeComponents(Session, Config)
    });
  }

  private BuildTicTacToeEmbed(Session: TicTacToeSession, Config: TicTacToeConfig): EmbedBuilder {
    const Color =
      Session.Status === "PlayerWon"
        ? Config.TicTacToeWinColor
        : Session.Status === "BotWon"
          ? Config.TicTacToeLoseColor
          : Session.Status === "Draw"
            ? Config.TicTacToeDrawColor
            : Session.Status === "TimedOut"
              ? Config.TicTacToeTimeoutColor
              : Config.TicTacToeColor;
    const Description =
      Session.Status === "PlayerWon"
        ? Config.TicTacToeWinMessage
        : Session.Status === "BotWon"
          ? Config.TicTacToeLoseMessage
          : Session.Status === "Draw"
            ? Config.TicTacToeDrawMessage
            : Session.Status === "TimedOut"
              ? Config.TicTacToeTimeoutMessage
              : Config.TicTacToeDescription;

    return new EmbedBuilder()
      .setTitle(this.ApplyTicTacToeTemplate(Config.TicTacToeTitle, Session, Config))
      .setDescription(this.ApplyTicTacToeTemplate(Description, Session, Config))
      .setColor(this.ParseColor(Color))
      .addFields(
        { name: "Difficulty", value: Session.Difficulty, inline: true },
        { name: "Player", value: `<@${Session.PlayerId}>`, inline: true },
        { name: "Turn", value: Session.Status === "Playing" ? "Your turn" : "Game ended", inline: true }
      )
      .setFooter({ text: `Player: ${Session.PlayerTag}` })
      .setTimestamp(new Date());
  }

  private BuildTicTacToeComponents(Session: TicTacToeSession, Config: TicTacToeConfig): Array<ActionRowBuilder<ButtonBuilder>> {
    const Rows: Array<ActionRowBuilder<ButtonBuilder>> = [];
    const GameEnded = Session.Status !== "Playing";

    for (let RowIndex = 0; RowIndex < 3; RowIndex += 1) {
      const Row = new ActionRowBuilder<ButtonBuilder>();

      for (let ColumnIndex = 0; ColumnIndex < 3; ColumnIndex += 1) {
        const CellIndex = RowIndex * 3 + ColumnIndex;
        const Cell = Session.Board[CellIndex];
        const Button = new ButtonBuilder()
          .setCustomId(`DiscordGame:TicTacToe:${Session.MessageId || "Pending"}:${CellIndex}`)
          .setStyle(this.GetTicTacToeButtonStyle(Cell))
          .setDisabled(GameEnded || Cell !== "Empty");

        if (Cell === "Player") {
          Button.setEmoji(Config.TicTacToePlayerEmoji || DefaultTicTacToeConfig.TicTacToePlayerEmoji);
        } else if (Cell === "Bot") {
          Button.setEmoji(Config.TicTacToeBotEmoji || DefaultTicTacToeConfig.TicTacToeBotEmoji);
        } else {
          Button.setLabel(Config.TicTacToeEmptyLabel || this.GetBlankButtonLabel());
        }

        Row.addComponents(Button);
      }

      Rows.push(Row);
    }

    return Rows;
  }

  private GetBotMove(Session: TicTacToeSession): number | null {
    const AvailableMoves = this.GetAvailableTicTacToeMoves(Session.Board);

    if (AvailableMoves.length === 0) {
      return null;
    }

    if (Session.Difficulty === "Easy") {
      return this.GetRandomMove(AvailableMoves);
    }

    if (Session.Difficulty === "Medium") {
      return this.GetRandomWinningMove(Session.Board, "Bot") ?? this.GetRandomWinningMove(Session.Board, "Player") ?? this.GetRandomMove(AvailableMoves);
    }

    return this.GetBestMove(Session.Board);
  }

  private GetBestMove(Board: TicTacToeCell[]): number {
    let BestScore = -Infinity;
    const BestMoves: number[] = [];

    for (const Move of this.ShuffleNumbers(this.GetAvailableTicTacToeMoves(Board))) {
      const NextBoard = [...Board];
      NextBoard[Move] = "Bot";
      const Score = this.ScoreTicTacToeBoard(NextBoard, false);

      if (Score > BestScore) {
        BestScore = Score;
        BestMoves.length = 0;
        BestMoves.push(Move);
        continue;
      }

      if (Score === BestScore) {
        BestMoves.push(Move);
      }
    }

    return this.GetRandomMove(BestMoves);
  }

  private ScoreTicTacToeBoard(Board: TicTacToeCell[], IsBotTurn: boolean): number {
    const Winner = this.GetTicTacToeWinner(Board);

    if (Winner === "Bot") {
      return 1;
    }

    if (Winner === "Player") {
      return -1;
    }

    const AvailableMoves = this.GetAvailableTicTacToeMoves(Board);

    if (AvailableMoves.length === 0) {
      return 0;
    }

    const Scores = AvailableMoves.map((Move) => {
      const NextBoard = [...Board];
      NextBoard[Move] = IsBotTurn ? "Bot" : "Player";
      return this.ScoreTicTacToeBoard(NextBoard, !IsBotTurn);
    });

    return IsBotTurn ? Math.max(...Scores) : Math.min(...Scores);
  }

  private GetRandomWinningMove(Board: TicTacToeCell[], Player: "Player" | "Bot"): number | null {
    const WinningMoves: number[] = [];

    for (const Move of this.GetAvailableTicTacToeMoves(Board)) {
      const NextBoard = [...Board];
      NextBoard[Move] = Player;

      if (this.GetTicTacToeWinner(NextBoard) === Player) {
        WinningMoves.push(Move);
      }
    }

    return WinningMoves.length > 0 ? this.GetRandomMove(WinningMoves) : null;
  }

  private UpdateTicTacToeStatus(Session: TicTacToeSession): void {
    const Winner = this.GetTicTacToeWinner(Session.Board);

    if (Winner === "Player") {
      Session.Status = "PlayerWon";
      return;
    }

    if (Winner === "Bot") {
      Session.Status = "BotWon";
      return;
    }

    if (this.GetAvailableTicTacToeMoves(Session.Board).length === 0) {
      Session.Status = "Draw";
    }
  }

  private GetTicTacToeWinner(Board: TicTacToeCell[]): "Player" | "Bot" | null {
    const Lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6]
    ];

    for (const [First, Second, Third] of Lines) {
      if (Board[First] !== "Empty" && Board[First] === Board[Second] && Board[Second] === Board[Third]) {
        return Board[First] as "Player" | "Bot";
      }
    }

    return null;
  }

  private GetAvailableTicTacToeMoves(Board: TicTacToeCell[]): number[] {
    return Board.map((Cell, Index) => (Cell === "Empty" ? Index : -1)).filter((Index) => Index >= 0);
  }

  private GetRandomMove(Moves: number[]): number {
    return Moves[Math.floor(Math.random() * Moves.length)] ?? Moves[0] ?? 0;
  }

  private ShuffleNumbers(Values: number[]): number[] {
    const ShuffledValues = [...Values];

    for (let Index = ShuffledValues.length - 1; Index > 0; Index -= 1) {
      const SwapIndex = Math.floor(Math.random() * (Index + 1));
      [ShuffledValues[Index], ShuffledValues[SwapIndex]] = [ShuffledValues[SwapIndex], ShuffledValues[Index]];
    }

    return ShuffledValues;
  }

  private GetTicTacToeButtonStyle(Cell: TicTacToeCell): ButtonStyle {
    if (Cell === "Player") {
      return ButtonStyle.Success;
    }

    if (Cell === "Bot") {
      return ButtonStyle.Danger;
    }

    return ButtonStyle.Secondary;
  }

  private ParseTicTacToeDifficulty(Value: string): TicTacToeDifficulty {
    if (Value === "Medium" || Value === "Impossible") {
      return Value;
    }

    return "Easy";
  }

  private BuildEmbed(Session: MinesweeperSession, Config: MinesweeperConfig): EmbedBuilder {
    const Color =
      Session.Status === "Won"
        ? Config.MinesweeperWinColor
        : Session.Status === "Lost"
          ? Config.MinesweeperLoseColor
          : Session.Status === "TimedOut"
            ? Config.MinesweeperTimeoutColor
            : Config.MinesweeperColor;
    const Description =
      Session.Status === "Won"
        ? Config.MinesweeperWinMessage
        : Session.Status === "Lost"
          ? Config.MinesweeperLoseMessage
          : Session.Status === "TimedOut"
            ? Config.MinesweeperTimeoutMessage
            : Config.MinesweeperDescription;

    return new EmbedBuilder()
      .setTitle(this.ApplyTemplate(Config.MinesweeperTitle, Session, Config))
      .setDescription(this.ApplyTemplate(Description, Session, Config))
      .setColor(this.ParseColor(Color))
      .addFields(
        { name: "Difficulty", value: Session.Difficulty, inline: true },
        { name: "Mines", value: String(Session.MineIndexes.length), inline: true },
        { name: "Safe tiles left", value: String(this.CountSafeTilesLeft(Session)), inline: true }
      )
      .setFooter({ text: `Player: ${Session.PlayerTag}` })
      .setTimestamp(new Date());
  }

  private BuildComponents(Session: MinesweeperSession, Config: MinesweeperConfig): Array<ActionRowBuilder<ButtonBuilder>> {
    const Rows: Array<ActionRowBuilder<ButtonBuilder>> = [];
    const GameEnded = Session.Status !== "Playing";

    for (let RowIndex = 0; RowIndex < GridSize; RowIndex += 1) {
      const Row = new ActionRowBuilder<ButtonBuilder>();

      for (let ColumnIndex = 0; ColumnIndex < GridSize; ColumnIndex += 1) {
        const TileIndex = RowIndex * GridSize + ColumnIndex;
        const IsRevealed = Session.RevealedIndexes.includes(TileIndex) || Session.Status === "Lost" || Session.Status === "Won";
        const IsMine = Session.MineIndexes.includes(TileIndex);
        const AdjacentMines = this.CountAdjacentMines(TileIndex, Session.MineIndexes);
        const TileDisplay = this.GetTileDisplay(IsRevealed, IsMine, AdjacentMines, Config);
        const Style = this.GetTileStyle(IsRevealed, IsMine, AdjacentMines, Session.Status);
        const Button = new ButtonBuilder()
          .setCustomId(`DiscordGame:Minesweeper:${Session.MessageId || "Pending"}:${TileIndex}`)
          .setStyle(Style)
          .setDisabled(IsRevealed || GameEnded);

        if (TileDisplay.Type === "Emoji") {
          Button.setEmoji(TileDisplay.Value);
        } else {
          Button.setLabel(TileDisplay.Value);
        }

        Row.addComponents(Button);
      }

      Rows.push(Row);
    }

    return Rows;
  }

  private RevealSafeTiles(Session: MinesweeperSession, StartIndex: number): number[] {
    const RevealedIndexes = new Set(Session.RevealedIndexes);
    const Queue = [StartIndex];

    while (Queue.length > 0) {
      const CurrentIndex = Queue.shift() as number;

      if (RevealedIndexes.has(CurrentIndex) || Session.MineIndexes.includes(CurrentIndex)) {
        continue;
      }

      RevealedIndexes.add(CurrentIndex);

      if (this.CountAdjacentMines(CurrentIndex, Session.MineIndexes) !== 0) {
        continue;
      }

      for (const NeighborIndex of this.GetNeighborIndexes(CurrentIndex)) {
        if (!RevealedIndexes.has(NeighborIndex) && !Session.MineIndexes.includes(NeighborIndex)) {
          Queue.push(NeighborIndex);
        }
      }
    }

    return Array.from(RevealedIndexes);
  }

  private CountAdjacentMines(TileIndex: number, MineIndexes: number[]): number {
    return this.GetNeighborIndexes(TileIndex).filter((NeighborIndex) => MineIndexes.includes(NeighborIndex)).length;
  }

  private GetNeighborIndexes(TileIndex: number): number[] {
    const Row = Math.floor(TileIndex / GridSize);
    const Column = TileIndex % GridSize;
    const Neighbors: number[] = [];

    for (let RowOffset = -1; RowOffset <= 1; RowOffset += 1) {
      for (let ColumnOffset = -1; ColumnOffset <= 1; ColumnOffset += 1) {
        if (RowOffset === 0 && ColumnOffset === 0) {
          continue;
        }

        const NeighborRow = Row + RowOffset;
        const NeighborColumn = Column + ColumnOffset;

        if (NeighborRow < 0 || NeighborRow >= GridSize || NeighborColumn < 0 || NeighborColumn >= GridSize) {
          continue;
        }

        Neighbors.push(NeighborRow * GridSize + NeighborColumn);
      }
    }

    return Neighbors;
  }

  private GetTileDisplay(IsRevealed: boolean, IsMine: boolean, AdjacentMines: number, Config: MinesweeperConfig): { Type: "Emoji" | "Label"; Value: string } {
    if (!IsRevealed) {
      return { Type: "Label", Value: this.GetBlankButtonLabel() };
    }

    if (IsMine) {
      return { Type: "Emoji", Value: Config.MineEmoji || DefaultConfig.MineEmoji };
    }

    if (AdjacentMines === 0) {
      return { Type: "Label", Value: this.GetBlankButtonLabel() };
    }

    return { Type: "Emoji", Value: Config.NumberEmojis[AdjacentMines - 1] || String(AdjacentMines) };
  }

  private GetTileStyle(IsRevealed: boolean, IsMine: boolean, AdjacentMines: number, Status: MinesweeperStatus): ButtonStyle {
    if (!IsRevealed) {
      return ButtonStyle.Primary;
    }

    if (IsMine) {
      return ButtonStyle.Danger;
    }

    return AdjacentMines === 0 ? ButtonStyle.Success : ButtonStyle.Primary;
  }

  private HasWon(Session: MinesweeperSession): boolean {
    return this.CountSafeTilesLeft(Session) === 0;
  }

  private CountSafeTilesLeft(Session: MinesweeperSession): number {
    const SafeTileIndexes = Array.from({ length: TileCount }, (_, Index) => Index).filter((Index) => !Session.MineIndexes.includes(Index));
    return SafeTileIndexes.filter((Index) => !Session.RevealedIndexes.includes(Index)).length;
  }

  private GenerateMineIndexes(MineCount: number): number[] {
    const Indexes = new Set<number>();

    while (Indexes.size < MineCount) {
      Indexes.add(Math.floor(Math.random() * TileCount));
    }

    return Array.from(Indexes);
  }

  private GetRandomSafeTileIndex(MineIndexes: number[]): number {
    const SafeIndexes = Array.from({ length: TileCount }, (_, Index) => Index).filter((Index) => !MineIndexes.includes(Index));
    return SafeIndexes[Math.floor(Math.random() * SafeIndexes.length)] ?? 0;
  }

  private ParseDifficulty(Value: string): MinesweeperDifficulty {
    if (Value === "Medium" || Value === "Hard") {
      return Value;
    }

    return "Easy";
  }

  private async GetConfig(GuildId: string): Promise<MinesweeperConfig> {
    return {
      MinesweeperTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperTitle")) ?? DefaultConfig.MinesweeperTitle,
      MinesweeperDescription: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperDescription")) ?? DefaultConfig.MinesweeperDescription,
      MinesweeperWinMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperWinMessage")) ?? DefaultConfig.MinesweeperWinMessage,
      MinesweeperLoseMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperLoseMessage")) ?? DefaultConfig.MinesweeperLoseMessage,
      MinesweeperTimeoutMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperTimeoutMessage")) ?? DefaultConfig.MinesweeperTimeoutMessage,
      MinesweeperUnauthorizedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperUnauthorizedMessage")) ?? DefaultConfig.MinesweeperUnauthorizedMessage,
      MinesweeperOnlyCreator: (await this.Storage.GetGlobalConfig<boolean>(GuildId, "MinesweeperOnlyCreator")) ?? DefaultConfig.MinesweeperOnlyCreator,
      MinesweeperColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperColor")) ?? DefaultConfig.MinesweeperColor,
      MinesweeperWinColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperWinColor")) ?? DefaultConfig.MinesweeperWinColor,
      MinesweeperLoseColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperLoseColor")) ?? DefaultConfig.MinesweeperLoseColor,
      MinesweeperTimeoutColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "MinesweeperTimeoutColor")) ?? DefaultConfig.MinesweeperTimeoutColor,
      HiddenTileEmoji: (await this.Storage.GetGlobalConfig<string>(GuildId, "HiddenTileEmoji")) ?? DefaultConfig.HiddenTileEmoji,
      EmptyTileEmoji: (await this.Storage.GetGlobalConfig<string>(GuildId, "EmptyTileEmoji")) ?? DefaultConfig.EmptyTileEmoji,
      MineEmoji: (await this.Storage.GetGlobalConfig<string>(GuildId, "MineEmoji")) ?? DefaultConfig.MineEmoji,
      NumberEmojis: (await this.Storage.GetGlobalConfig<string[]>(GuildId, "NumberEmojis")) ?? DefaultConfig.NumberEmojis
    };
  }

  private async GetTicTacToeConfig(GuildId: string): Promise<TicTacToeConfig> {
    return {
      TicTacToeTitle: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeTitle")) ?? DefaultTicTacToeConfig.TicTacToeTitle,
      TicTacToeDescription: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeDescription")) ?? DefaultTicTacToeConfig.TicTacToeDescription,
      TicTacToeWinMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeWinMessage")) ?? DefaultTicTacToeConfig.TicTacToeWinMessage,
      TicTacToeLoseMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeLoseMessage")) ?? DefaultTicTacToeConfig.TicTacToeLoseMessage,
      TicTacToeDrawMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeDrawMessage")) ?? DefaultTicTacToeConfig.TicTacToeDrawMessage,
      TicTacToeTimeoutMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeTimeoutMessage")) ?? DefaultTicTacToeConfig.TicTacToeTimeoutMessage,
      TicTacToeUnauthorizedMessage: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeUnauthorizedMessage")) ?? DefaultTicTacToeConfig.TicTacToeUnauthorizedMessage,
      TicTacToeColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeColor")) ?? DefaultTicTacToeConfig.TicTacToeColor,
      TicTacToeWinColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeWinColor")) ?? DefaultTicTacToeConfig.TicTacToeWinColor,
      TicTacToeLoseColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeLoseColor")) ?? DefaultTicTacToeConfig.TicTacToeLoseColor,
      TicTacToeDrawColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeDrawColor")) ?? DefaultTicTacToeConfig.TicTacToeDrawColor,
      TicTacToeTimeoutColor: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeTimeoutColor")) ?? DefaultTicTacToeConfig.TicTacToeTimeoutColor,
      TicTacToePlayerEmoji: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToePlayerEmoji")) ?? DefaultTicTacToeConfig.TicTacToePlayerEmoji,
      TicTacToeBotEmoji: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeBotEmoji")) ?? DefaultTicTacToeConfig.TicTacToeBotEmoji,
      TicTacToeEmptyLabel: (await this.Storage.GetGlobalConfig<string>(GuildId, "TicTacToeEmptyLabel")) ?? DefaultTicTacToeConfig.TicTacToeEmptyLabel
    };
  }

  private async GetSessions(GuildId: string): Promise<MinesweeperSessions> {
    return (await this.Storage.GetGlobalConfig<MinesweeperSessions>(GuildId, SessionsStorageKey)) ?? {};
  }

  private async GetSession(GuildId: string, MessageId: string): Promise<MinesweeperSession | null> {
    const Sessions = await this.GetSessions(GuildId);
    return Sessions[MessageId] ?? null;
  }

  private async SaveSession(Session: MinesweeperSession): Promise<void> {
    const Sessions = await this.GetSessions(Session.GuildId);
    Sessions[Session.MessageId] = Session;
    await this.Storage.SetGlobalConfig(Session.GuildId, SessionsStorageKey, Sessions);
  }

  private async GetTicTacToeSessions(GuildId: string): Promise<TicTacToeSessions> {
    return (await this.Storage.GetGlobalConfig<TicTacToeSessions>(GuildId, TicTacToeSessionsStorageKey)) ?? {};
  }

  private async GetTicTacToeSession(GuildId: string, MessageId: string): Promise<TicTacToeSession | null> {
    const Sessions = await this.GetTicTacToeSessions(GuildId);
    return Sessions[MessageId] ?? null;
  }

  private async SaveTicTacToeSession(Session: TicTacToeSession): Promise<void> {
    const Sessions = await this.GetTicTacToeSessions(Session.GuildId);
    Sessions[Session.MessageId] = Session;
    await this.Storage.SetGlobalConfig(Session.GuildId, TicTacToeSessionsStorageKey, Sessions);
  }

  private ApplyTemplate(Template: string, Session: MinesweeperSession, Config: MinesweeperConfig): string {
    return Template
      .replaceAll("%user%", `<@${Session.PlayerId}>`)
      .replaceAll("%tag%", Session.PlayerTag)
      .replaceAll("%difficulty%", Session.Difficulty)
      .replaceAll("%mines%", String(Session.MineIndexes.length))
      .replaceAll("%safeLeft%", String(this.CountSafeTilesLeft(Session)))
      .replaceAll("%timeoutMinutes%", "5")
      .replaceAll("%hidden%", Config.HiddenTileEmoji)
      .replaceAll("%mine%", Config.MineEmoji);
  }

  private ApplyTicTacToeTemplate(Template: string, Session: TicTacToeSession, Config: TicTacToeConfig): string {
    return Template
      .replaceAll("%user%", `<@${Session.PlayerId}>`)
      .replaceAll("%tag%", Session.PlayerTag)
      .replaceAll("%difficulty%", Session.Difficulty)
      .replaceAll("%playerEmoji%", Config.TicTacToePlayerEmoji)
      .replaceAll("%botEmoji%", Config.TicTacToeBotEmoji)
      .replaceAll("%timeoutMinutes%", "5");
  }

  private async EditGameMessage(Session: MinesweeperSession): Promise<void> {
    const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
    const Channel = Session.ChannelId ? await Guild?.channels.fetch(Session.ChannelId).catch(() => null) : null;

    if (!Channel?.isTextBased()) {
      return;
    }

    const MessageValue = await Channel.messages.fetch(Session.MessageId).catch(() => null) as Message | null;

    if (!MessageValue) {
      return;
    }

    const Config = await this.GetConfig(Session.GuildId);
    const Payload: MessageEditOptions = {
      embeds: [this.BuildEmbed(Session, Config)],
      components: this.BuildComponents(Session, Config)
    };

    await MessageValue.edit(Payload).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not edit timed out Minesweeper game.", ErrorValue);
    });
  }

  private async EditTicTacToeMessage(Session: TicTacToeSession): Promise<void> {
    const Guild = this.DiscordClient.guilds.cache.get(Session.GuildId);
    const Channel = Session.ChannelId ? await Guild?.channels.fetch(Session.ChannelId).catch(() => null) : null;

    if (!Channel?.isTextBased()) {
      return;
    }

    const MessageValue = await Channel.messages.fetch(Session.MessageId).catch(() => null) as Message | null;

    if (!MessageValue) {
      return;
    }

    const Config = await this.GetTicTacToeConfig(Session.GuildId);
    const Payload: MessageEditOptions = {
      embeds: [this.BuildTicTacToeEmbed(Session, Config)],
      components: this.BuildTicTacToeComponents(Session, Config)
    };

    await MessageValue.edit(Payload).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Could not edit timed out Tic-Tac-Toe game.", ErrorValue);
    });
  }

  private IsSessionTimedOut(Session: MinesweeperSession, Now: number): boolean {
    return Now - (Session.LastInputAt || Date.parse(Session.CreatedAt)) >= 5 * 60 * 1000;
  }

  private IsTicTacToeTimedOut(Session: TicTacToeSession, Now: number): boolean {
    return Now - (Session.LastInputAt || Date.parse(Session.CreatedAt)) >= 5 * 60 * 1000;
  }

  private GetBlankButtonLabel(): string {
    return "​";
  }

  private ParseColor(ColorValue: string): number {
    const SafeColor = /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : DefaultConfig.MinesweeperColor;
    return Number.parseInt(SafeColor.replace("#", ""), 16);
  }
}
