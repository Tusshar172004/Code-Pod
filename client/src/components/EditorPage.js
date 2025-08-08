import React, { useEffect, useRef, useState } from "react";
import Client from "./Client";
import Editor from "./Editor";
import { initSocket } from "../Socket";
import { ACTIONS } from "../Actions";
import {
  useNavigate,
  useLocation,
  Navigate,
  useParams,
} from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";
import { FaPaperPlane, FaMicrophone, FaMicrophoneSlash, FaPlay, FaPhoneAlt, FaSignOutAlt, FaClipboard } from "react-icons/fa"; // FaSyncAlt removed
import Peer from "peerjs";

const LANGUAGES = [
  "python3", "java", "cpp", "nodejs", "c", "ruby", "go", "scala",
  "bash", "sql", "pascal", "csharp", "php", "swift", "rust", "r",
];

function EditorPage() {
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [clients, setClients] = useState([]);
  const [output, setOutput] = useState("");
  const [isCompileWindowOpen, setIsCompileWindowOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("python3");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const incomingCallRef = useRef(null);

  const [code, setCode] = useState("");
  const chatMessagesRef = useRef(null);
  const Location = useLocation();
  const navigate = useNavigate();
  const { roomId } = useParams();
  const socketRef = useRef(null);

  const peerRef = useRef(null);
  const myStreamRef = useRef(null);
  const connectionsRef = useRef({});
  const audioElementsRef = useRef({});

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  const playAudio = (peerId, stream) => {
    if (!audioElementsRef.current[peerId]) {
      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.play();
      audioElementsRef.current[peerId] = audio;
      document.body.appendChild(audio);
    }
  };

  const removeAudio = (peerId) => {
    const audio = audioElementsRef.current[peerId];
    if (audio) {
      audio.remove();
      delete audioElementsRef.current[peerId];
    }
  };

  const startCall = () => {
    if (!myStreamRef.current || !peerRef.current) {
      toast.error("Microphone not accessible.");
      return;
    }

    setIsCallActive(true);
    toast.success("Starting voice call...");
    socketRef.current.emit('initiate-call', { roomId, username: Location.state?.username });

    setTimeout(() => {
      clients.forEach(client => {
        if (client.peerId && client.peerId !== peerRef.current.id) {
          const call = peerRef.current.call(
            client.peerId,
            myStreamRef.current,
            { metadata: { username: Location.state?.username } }
          );
          connectionsRef.current[client.peerId] = call;
          call.on('stream', (remoteStream) => {
            playAudio(client.peerId, remoteStream);
          });
          call.on('close', () => {
            removeAudio(client.peerId);
          });
        }
      });
    }, 1000);
  };

  const pickupCall = () => {
    const call = incomingCallRef.current;
    if (call && myStreamRef.current) {
      call.answer(myStreamRef.current);
      call.on('stream', (remoteStream) => {
        playAudio(call.peer, remoteStream);
      });
      setIsCallActive(true);
      setIncomingCall(null);
      toast.dismiss();
    }
  };

  const cutCall = () => {
    const call = incomingCallRef.current;
    if (call) {
      call.close();
    }
    setIncomingCall(null);
    toast.dismiss();
  };

  const hangUp = () => {
    setIsCallActive(false);
    toast.success("Call ended.");
    Object.values(connectionsRef.current).forEach(call => call.close());
    connectionsRef.current = {};
    Object.keys(audioElementsRef.current).forEach(removeAudio);
  };

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on("connect_error", (err) => handleErrors(err));
      socketRef.current.on("connect_failed", (err) => handleErrors(err));

      const handleErrors = (err) => {
        console.log("Error", err);
        toast.error("Socket connection failed, Try again later");
        navigate("/");
      };

      try {
        myStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
      } catch (err) {
        console.error("Failed to get local audio stream", err);
        toast.error("Could not access microphone.");
        myStreamRef.current = null;
      }

      // Updated PeerJS configuration to connect to the correct host
      peerRef.current = new Peer({
        host: window.location.hostname,
        port: window.location.port ? Number(window.location.port) : 443,
        path: '/myapp'
      });

      peerRef.current.on('open', (peerId) => {
        socketRef.current.emit(ACTIONS.JOIN, {
          roomId,
          username: Location.state?.username,
          peerId: peerId,
        });
      });

      peerRef.current.on('call', (call) => {
        incomingCallRef.current = call;
        setIncomingCall(call);
        toast(`${call.metadata.username} is calling...`, {
          duration: Infinity,
          icon: '📞'
        });
      });

      socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
        if (username !== Location.state?.username) {
          toast.success(`${username} joined the room.`);
        }
        setClients(clients);
      });
      
      socketRef.current.on(ACTIONS.SYNC_CODE, ({ code: syncedCode }) => {
        if (syncedCode !== null && syncedCode !== code) {
            setCode(syncedCode);
        }
      });
      
      socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code: receivedCode }) => {
        if (receivedCode !== null && receivedCode !== code) {
          setCode(receivedCode);
        }
      });

      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room`);
        setClients((prev) => {
          const client = prev.find(c => c.socketId === socketId);
          if (client && connectionsRef.current[client.peerId]) {
            connectionsRef.current[client.peerId].close();
            delete connectionsRef.current[client.peerId];
            removeAudio(client.peerId);
          }
          return prev.filter((client) => client.socketId !== socketId);
        });
      });

      socketRef.current.on("chat-message", ({ username, message }) => {
        setMessages((prev) => [...prev, { username, message }]);
      });
      
      socketRef.current.on("toggle-mute", ({ socketId, isMuted }) => {
        setClients(prevClients => 
          prevClients.map(client =>
            client.socketId === socketId ? { ...client, isMuted } : client
          )
        );
      });
    };

    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        if (socketRef.current.off) { 
          socketRef.current.off(ACTIONS.JOINED);
          socketRef.current.off(ACTIONS.DISCONNECTED);
          socketRef.current.off("chat-message");
          socketRef.current.off("toggle-mute");
          socketRef.current.off(ACTIONS.CODE_CHANGE);
          socketRef.current.off(ACTIONS.SYNC_CODE);
        }
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      if (myStreamRef.current) {
        myStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [Location.state?.username, code, navigate, roomId]);

  if (!Location.state) return <Navigate to="/" />;

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success(`Room ID is copied`);
    } catch (error) {
      console.log(error);
      toast.error("Unable to copy the room ID");
    }
  };

  const leaveRoom = async () => navigate("/");

  const runCode = async () => {
    setIsCompiling(true);
    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/compile`, {
        code: code,
        language: selectedLanguage,
      });
      setOutput(response.data.output || JSON.stringify(response.data));
      setIsCompileWindowOpen(true);
    } catch (error) {
      setOutput(error.response?.data?.error || "An error occurred");
      setIsCompileWindowOpen(true);
    } finally {
      setIsCompiling(false);
    }
  };

  const toggleCompileWindow = () => setIsCompileWindowOpen(!isCompileWindowOpen);

  const sendMessage = () => {
    if (chatInput.trim()) {
      socketRef.current.emit("chat-message", {
        roomId,
        username: Location.state?.username,
        message: chatInput.trim(),
      });
      setChatInput("");
    }
  };

  const toggleMute = () => {
    if (myStreamRef.current) {
      const audioTrack = myStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const newMuteState = !audioTrack.enabled;
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(newMuteState);

        socketRef.current.emit('toggle-mute', {
          roomId,
          isMuted: newMuteState,
        });
      }
    }
  };

  return (
    <div className="container-fluid vh-100 d-flex flex-column">
      <div className="row flex-grow-1">
        <div className="col-md-2 bg-dark text-light d-flex flex-column">
          <img src="/images/codecast.png" alt="Logo" className="img-fluid mx-auto" style={{ maxWidth: "150px", marginTop: "-43px" }} />
          <hr style={{ marginTop: "-3rem" }} />

          <div className="d-flex flex-column flex-grow-1 overflow-auto">
            <span className="mb-2">Members</span>
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} isMuted={client.isMuted} />
            ))}
          </div>
          
          <div className="border-top mt-2 pt-2 d-flex flex-column justify-content-end" style={{ maxHeight: "40vh" }}>
            <div className="flex-grow-1 overflow-auto px-2 mb-2">
              <div className="fw-bold text-secondary">CHAT</div>
              <div className="chat-messages overflow-auto" style={{ maxHeight: "15vh" }} ref={chatMessagesRef}>
                {messages.map((msg, idx) => (
                  <div key={idx}>
                    <span className="text-success fw-bold">{msg.username}:</span> <span className="text-light">{msg.message}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="input-group px-2">
              <input
                type="text"
                className="form-control bg-secondary text-light border-0"
                placeholder="Type message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button className="btn btn-primary" onClick={sendMessage}>
                <FaPaperPlane />
              </button>
            </div>
          </div>
        </div>

        <div className="col-md-10 text-light d-flex flex-column">
          <div className="bg-dark p-2 d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              {/* Call buttons are now consolidated here and shown based on call state */}
              {!isCallActive && !incomingCall ? (
                <button className="btn btn-primary me-2" onClick={startCall}>
                  <FaPhoneAlt /> Call
                </button>
              ) : isCallActive && !incomingCall ? (
                <button className="btn btn-danger me-2" onClick={hangUp}>
                  <FaPhoneAlt /> Hang Up
                </button>
              ) : incomingCall ? (
                <div className="d-flex align-items-center">
                  <span className="me-2 text-warning">Incoming Call...</span>
                  <button className="btn btn-success me-2" onClick={pickupCall}>Pick Up</button>
                  <button className="btn btn-danger me-2" onClick={cutCall}>Cut</button>
                </div>
              ) : null}
              
              <button className="btn btn-warning me-2" onClick={toggleMute} disabled={!isCallActive}>
                {isMicMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
              </button>
              
              {/* Other action buttons */}
              <button className="btn btn-success me-2" onClick={copyRoomId}>
                <FaClipboard /> Copy ID
              </button>
              <button className="btn btn-danger me-2" onClick={leaveRoom}>
                <FaSignOutAlt /> Leave
              </button>
            </div>
            <div className="d-flex align-items-center">
              <button className="btn btn-success me-2" onClick={runCode} disabled={isCompiling}>
                {isCompiling ? "Compiling..." : <><FaPlay /> Run</>}
              </button>
              <button className="btn btn-secondary me-2" onClick={toggleCompileWindow}>
                {isCompileWindowOpen ? "Close Output" : "Open Output"}
              </button>
              <select className="form-select w-auto" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}>
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
          </div>
          <Editor socketRef={socketRef} roomId={roomId} onCodeChange={setCode} code={code} />
        </div>
      </div>

      <div className={`bg-dark text-light p-3 ${isCompileWindowOpen ? "d-block" : "d-none"}`} style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: isCompileWindowOpen ? "30vh" : "0",
        transition: "height 0.3s ease-in-out",
        overflowY: "auto",
        zIndex: 1040,
      }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="m-0">Compiler Output ({selectedLanguage})</h5>
          <button className="btn btn-secondary" onClick={toggleCompileWindow}>Close</button>
        </div>
        <pre className="bg-secondary p-3 rounded">{output || "Output will appear here after compilation"}</pre>
      </div>
    </div>
  );
}

export default EditorPage;