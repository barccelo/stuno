"use client";

import { useEffect, useRef, useState } from "react";

export type VoiceSignal = {
  id: string;
  from: string;
  to: string;
  type: "join" | "leave" | "offer" | "answer";
  sdp?: string | null;
  at: number;
};

type VoicePlayer = { id: string; name: string };

type Props = {
  roomCode: string;
  playerId: string;
  players: VoicePlayer[];
  signals?: VoiceSignal[];
  onActiveChange?: (active: boolean) => void;
};

type RemotePeer = {
  id: string;
  name: string;
  stream: MediaStream;
};

const AUDIO_BITRATE = 24000;

function waitForIce(pc: RTCPeerConnection, timeout = 3500) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", check);
    window.setTimeout(finish, timeout);
  });
}

async function capSender(sender: RTCRtpSender) {
  try {
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = AUDIO_BITRATE;
    await sender.setParameters(parameters);
  } catch {}
}

export default function VoiceChat({
  roomCode,
  playerId,
  players,
  signals = [],
  onActiveChange,
}: Props) {
  const [active, setActive] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [relayConfigured, setRelayConfigured] = useState(false);
  const [error, setError] = useState("");

  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceServers = useRef<RTCIceServer[]>([
    { urls: ["stun:stun.cloudflare.com:3478"] },
  ]);
  const handled = useRef(new Set<string>());
  const joinedAt = useRef(0);
  const activeRef = useRef(false);

  const playerName = (id: string) =>
    players.find((player) => player.id === id)?.name ?? "Jugador";

  async function sendSignal(
    type: VoiceSignal["type"],
    to = "*",
    sdp?: string,
  ) {
    const response = await fetch("/api/voice/signal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: roomCode, playerId, type, to, sdp }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || "No se pudo sincronizar el audio.");
    }
  }

  function removePeer(peerId: string) {
    const pc = peers.current.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peers.current.delete(peerId);
    }
    setRemotePeers((current) => current.filter((peer) => peer.id !== peerId));
  }

  function createPeer(peerId: string) {
    const existing = peers.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: iceServers.current,
      bundlePolicy: "max-bundle",
    });
    peers.current.set(peerId, pc);

    const stream = localStream.current;
    if (stream) {
      for (const track of stream.getAudioTracks()) {
        const sender = pc.addTrack(track, stream);
        void capSender(sender);
      }
    }

    pc.ontrack = (event) => {
      const streamFromPeer = event.streams[0] ?? new MediaStream([event.track]);
      setRemotePeers((current) => {
        const next = current.filter((peer) => peer.id !== peerId);
        return [...next, { id: peerId, name: playerName(peerId), stream: streamFromPeer }];
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(peerId);
      }
    };

    return pc;
  }

  async function offerTo(peerId: string) {
    const pc = createPeer(peerId);
    if (pc.signalingState !== "stable" || pc.localDescription) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    const sdp = pc.localDescription?.sdp;
    if (sdp) await sendSignal("offer", peerId, sdp);
  }

  async function answerOffer(peerId: string, sdp: string) {
    let pc = createPeer(peerId);
    if (pc.signalingState !== "stable") {
      removePeer(peerId);
      pc = createPeer(peerId);
    }
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    const localSdp = pc.localDescription?.sdp;
    if (localSdp) await sendSignal("answer", peerId, localSdp);
  }

  async function acceptAnswer(peerId: string, sdp: string) {
    const pc = peers.current.get(peerId);
    if (!pc || pc.signalingState !== "have-local-offer") return;
    await pc.setRemoteDescription({ type: "answer", sdp });
  }

  async function joinVoice() {
    if (joining || activeRef.current) return;
    setJoining(true);
    setError("");
    try {
      const [stream, iceResponse] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
        fetch("/api/voice/ice", { cache: "no-store" }),
      ]);
      const iceData = (await iceResponse.json().catch(() => null)) as {
        iceServers?: RTCIceServer[];
        relayConfigured?: boolean;
      } | null;
      if (iceData?.iceServers?.length) iceServers.current = iceData.iceServers;
      setRelayConfigured(Boolean(iceData?.relayConfigured));

      for (const track of stream.getAudioTracks()) {
        track.contentHint = "speech";
      }
      localStream.current = stream;
      joinedAt.current = Date.now();
      activeRef.current = true;
      setActive(true);
      onActiveChange?.(true);
      setPanelOpen(true);
      await sendSignal("join");
    } catch (cause) {
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      activeRef.current = false;
      setActive(false);
      onActiveChange?.(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo activar el micrófono.",
      );
    } finally {
      setJoining(false);
    }
  }

  function leaveVoice(notify = true) {
    if (notify && activeRef.current) void sendSignal("leave").catch(() => {});
    activeRef.current = false;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    for (const peerId of Array.from(peers.current.keys())) removePeer(peerId);
    handled.current.clear();
    setRemotePeers([]);
    setActive(false);
    onActiveChange?.(false);
    setMuted(false);
    setPanelOpen(false);
  }

  useEffect(() => {
    if (!active) return;
    const freshSignals = signals
      .filter(
        (signal) =>
          signal.from !== playerId &&
          signal.at >= joinedAt.current - 1000 &&
          !handled.current.has(signal.id),
      )
      .sort((a, b) => a.at - b.at);

    for (const signal of freshSignals) {
      handled.current.add(signal.id);
      void (async () => {
        try {
          if (signal.type === "join") await offerTo(signal.from);
          else if (signal.type === "offer" && signal.sdp)
            await answerOffer(signal.from, signal.sdp);
          else if (signal.type === "answer" && signal.sdp)
            await acceptAnswer(signal.from, signal.sdp);
          else if (signal.type === "leave") removePeer(signal.from);
        } catch {
          removePeer(signal.from);
        }
      })();
    }
  }, [signals, active, playerId]);

  useEffect(() => {
    if (!active) return;
    const playerIds = new Set(players.map((player) => player.id));
    for (const peerId of Array.from(peers.current.keys())) {
      if (!playerIds.has(peerId)) removePeer(peerId);
    }
  }, [players, active]);

  useEffect(() => () => leaveVoice(false), []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    localStream.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
  }

  return (
    <div className={`voice-chat ${active ? "active" : ""}`}>
      {!active ? (
        <button
          type="button"
          className="voice-entry"
          onClick={() => void joinVoice()}
          disabled={joining}
          title="Entrar al chat de voz"
        >
          <span aria-hidden="true">🎙</span>
          {joining ? "Conectando…" : "Voz"}
        </button>
      ) : (
        <button
          type="button"
          className="voice-entry connected"
          onClick={() => setPanelOpen((value) => !value)}
          title="Controles de voz"
        >
          <span aria-hidden="true">🎙</span>
          {remotePeers.length + 1}
        </button>
      )}

      {panelOpen && active && (
        <section className="voice-panel" aria-label="Chat de voz">
          <div className="voice-panel-head">
            <div>
              <strong>Chat de voz</strong>
              <small>{remotePeers.length + 1} conectados</small>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Cerrar controles">×</button>
          </div>
          <div className="voice-controls">
            <button type="button" className={muted ? "muted" : ""} onClick={toggleMute}>
              {muted ? "Micrófono apagado" : "Micrófono activo"}
            </button>
            <button type="button" className={speakerMuted ? "muted" : ""} onClick={() => setSpeakerMuted((value) => !value)}>
              {speakerMuted ? "Audio apagado" : "Audio activo"}
            </button>
          </div>
          <div className="voice-peer-list">
            <span><b>Tú</b>{muted ? " · silencio" : ""}</span>
            {remotePeers.map((peer) => (
              <span key={peer.id}>{peer.name}</span>
            ))}
          </div>
          <small className="voice-network-note">
            Conexión directa optimizada{relayConfigured ? " · TURN disponible como respaldo" : " · STUN gratuito"}
          </small>
          <button type="button" className="voice-leave" onClick={() => leaveVoice(true)}>
            Salir de voz
          </button>
        </section>
      )}

      {remotePeers.map((peer) => (
        <audio
          key={peer.id}
          autoPlay
          playsInline
          muted={speakerMuted}
          ref={(element) => {
            if (element && element.srcObject !== peer.stream) element.srcObject = peer.stream;
          }}
        />
      ))}
      {error && <div className="voice-error">{error}</div>}
    </div>
  );
}
