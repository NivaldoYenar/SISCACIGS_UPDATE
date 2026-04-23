"use client";

import { RequireAuth } from "@/components/require-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, getToken } from "@/lib/auth-client";
import type { ItemStatus } from "@/lib/centralApi";
import { useAuth } from "@/components/auth-provider";
import { Role } from "@/lib/permissions";

type PaginatedItems = {
  items: ItemStatus[];
  total: number;
  page: number;
  page_size: number;
};

async function authFetchJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Request failed (${res.status}): ${text || res.statusText}`
    );
  }

  return res.json() as Promise<T>;
}

type RecognizedUser = {
  user_id: string;
  user_name: string;
  confidence: number;
  captured_at: string;
  recognition_token: string; // novo
};

export default function TerminalPage() {
  const { user, loading: authLoading  } = useAuth();
      if (authLoading) {
      return (
        <RequireAuth>
          <main className="space-y-4">
            <h1 className="text-2xl font-semibold">Terminal</h1>
            <p className="text-sm text-slate-400">Car regando usuário...</p>
          </main>
        </RequireAuth>
      );
    }

      if (!user) {
        return (
          <RequireAuth>
            <main className="space-y-4">
              <h1 className="text-2xl font-semibold">Terminal</h1>
              <p className="text-sm text-red-300">
                Usuário não autenticado.
              </p>
            </main>
          </RequireAuth>
        );
      }

  const userRole = user.role as Role;

  const canAccessTerminalMovements =
    userRole === "ADMIN" || userRole === "SCMT_OM" || userRole === "ARMEIRO";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamError, setStreamError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown | null>(null);

  const [items, setItems] = useState<ItemStatus[]>([]);
  const [mode, setMode] = useState<"cautela" | "descautela">("cautela");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState("");

  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser | null>(
    null
  );
  const [recognizeError, setRecognizeError] = useState<string | null>(null);

  // mapa item_id -> texto de disturbance (apenas para descautela)
  const [disturbances, setDisturbances] = useState<Record<string, string>>({});

  // destino/observação da cautela
  const [destination, setDestination] = useState<
    "" | "servico" | "missao" | "outro"
  >("");
  const [observation, setObservation] = useState("");

  // flag de acesso negado
  const [forbidden, setForbidden] = useState(false);

  // ---- Helpers ----

  async function loadItems() {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", "200"); // <= 200 para não tomar 422

      const data = await authFetchJson<PaginatedItems>(
        `/items/status?${params.toString()}`
      );
      setItems(data.items);
    } catch (err) {
      console.error("Erro ao carregar itens:", err);
      if (err instanceof Error && err.message.includes("(403)")) {
        setForbidden(true);
      }
    }
  }

  async function reloadItems() {
    await loadItems();
    setSelectedItemIds([]);
  }

  // ---- Efeitos ----

  useEffect(() => {
    let mountedVideo: HTMLVideoElement | null = null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          mountedVideo = videoRef.current;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error(err);
        setStreamError("Não foi possível acessar a webcam.");
      }
    }

    start();
    void loadItems();

    return () => {
      if (mountedVideo && mountedVideo.srcObject) {
        const tracks = (mountedVideo.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
    };
  }, []);

  // sempre que mudar usuário reconhecido/itens/mode, preenche disturbances
  useEffect(() => {
    if (mode !== "descautela" || !recognizedUser) {
      setDisturbances({});
      return;
    }

    const initial: Record<string, string> = {};
    for (const item of items) {
      if (
        item.current_user_id === recognizedUser.user_id &&
        item.disturbance &&
        item.disturbance.trim()
      ) {
        initial[item.item_id] = item.disturbance;
      }
    }
    setDisturbances(initial);
  }, [mode, recognizedUser, items]);

  // ---- Derivados ----

  const filteredItems = useMemo(() => {
    let base = items;

    if (mode === "cautela") {
      base = base.filter((item) => item.status === "available");
    } else {
      if (!recognizedUser) {
        return [];
      }
      base = base.filter(
        (item) => item.current_user_id === recognizedUser.user_id
      );
    }

    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      base = base.filter((item) => {
        return (
          item.item_name.toLowerCase().includes(q) ||
          (item.serial_number ?? "").toLowerCase().includes(q) ||
          (item.asset_number ?? "").toLowerCase().includes(q)
        );
      });
    }

    return base;
  }, [items, mode, itemSearch, recognizedUser]);

  // ---- Handlers ----

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleDisturbanceChange = (itemId: string, value: string) => {
    setDisturbances((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  function captureFrame(): string | null {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  // ---- Cautela ----
  async function handleCautela() {
    if (selectedItemIds.length === 0) {
      alert("Selecione ao menos um item para cautelar.");
      return;
    }

    if (!destination) {
      alert("Selecione o destino do material.");
      return;
    }

    const dataUrl = captureFrame();
    if (!dataUrl) {
      alert("Não foi possível capturar a imagem da câmera.");
      return;
    }

    setLoading(true);
    setResult(null);
    setRecognizeError(null);

    try {
      const responses: unknown[] = [];

      for (const itemId of selectedItemIds) {
        const body: {
          action: "cautela";
          item_id: string;
          image_b64: string;
          destination: "servico" | "missao" | "outro";
          observation?: string;
        } = {
          action: "cautela",
          item_id: itemId,
          image_b64: dataUrl,
          destination,
        };

        if (observation.trim()) {
          body.observation = observation.trim();
        }

        const token = getToken();

        const res = await fetch(`${API_BASE}/api/recognize-from-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        const json = await res.json();
        responses.push(json);
      }

      setResult(responses);

      await reloadItems();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setResult({ error: message });
    } finally {
      setLoading(false);
    }
  }

  // ---- Descautela: passo 1 ----
  async function handleRecognizeForReturn() {
    const dataUrl = captureFrame();
    if (!dataUrl) {
      alert("Não foi possível capturar a imagem da câmera.");
      return;
    }

    setLoading(true);
    setRecognizeError(null);
    setResult(null);
    setRecognizedUser(null);
    setSelectedItemIds([]);
    setDisturbances({});

    try {
      const res = await fetch(`${API_BASE}/api/recognize-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_b64: dataUrl }),
      });

      const json = (await res.json()) as any;

      if (!json.matched) {
        setRecognizeError(
          json.reason === "no_face"
            ? "Nenhum rosto detectado. Tente novamente."
            : "Nenhum usuário encontrado com confiança suficiente."
        );
        setRecognizedUser(null);
        return;
      }

      const user: RecognizedUser = {
        user_id: json.user_id,
        user_name: json.user_name,
        confidence: json.confidence,
        captured_at: json.captured_at,
        recognition_token: json.recognition_token, // <---
      };

      setRecognizedUser(user);
      setRecognizeError(null);
      setResult(json);

      await reloadItems();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setRecognizeError(message);
      setResult({ error: message });
    } finally {
      setLoading(false);
    }
  }

  // ---- Descautela: passo 2 ----
  async function handleConfirmDescautela() {
    if (!recognizedUser) {
      alert("Primeiro reconheça o usuário.");
      return;
    }
    if (selectedItemIds.length === 0) {
      alert("Selecione ao menos um item para devolver.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const onlyFilled: Record<string, string> = {};
      for (const id of selectedItemIds) {
        const d = disturbances[id];
        if (d && d.trim()) {
          onlyFilled[id] = d.trim();
        }
      }

      const body: {
        user_id: string;
        item_ids: string[];
        action: string;
        disturbances?: Record<string, string>;
        recognition_token: string;
      } = {
        user_id: recognizedUser.user_id,
        item_ids: selectedItemIds,
        action: "descautela",
        recognition_token: recognizedUser.recognition_token,
      };

      if (Object.keys(onlyFilled).length > 0) {
        body.disturbances = onlyFilled;
      }

      const resp = await authFetchJson<unknown>("/manual/movements/terminal", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setResult(resp);

      await reloadItems();
      setDisturbances({});
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("(403)")) {
        setForbidden(true);
        setResult({ error: "Acesso negado ao registrar descautela." });
        alert("Você não possui permissão para descautelar itens.");
      } else {
        setResult({ error: message });
        alert(message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!canAccessTerminalMovements) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Terminal</h1>
        <p className="text-sm text-red-300">
          Você não tem permissão para importar usuários.
        </p>
      </main>
    );
  }

  // ---- Acesso negado ----
  if (forbidden) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
          <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-semibold">Acesso negado</h1>
            <p className="text-slate-400 text-sm">
              Você não possui permissão para utilizar o terminal de cautela.
            </p>
          </div>
        </main>
      </RequireAuth>
    );
  }

  // ---- JSX normal ----
  return (
    <RequireAuth>
      <main className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">
            Terminal de Cautela (Reconhecimento Facial)
          </h1>
          <p className="text-sm text-slate-400">
            Cautela: selecione itens, defina o destino e use a câmera.
            <br />
            Descautela: reconheça o usuário e devolva apenas os itens em posse
            dele, registrando alterações nos materiais.
          </p>
        </header>

        {streamError && <p className="text-sm text-red-400">{streamError}</p>}

        {mode === "cautela" && (
          <section className="space-y-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
            <h2 className="text-sm font-medium">Destino do material</h2>
            <p className="text-xs text-slate-400">
              Destino aplicado a todos os itens desta cautela.
            </p>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="servico"
                  checked={destination === "servico"}
                  onChange={() => setDestination("servico")}
                />
                Serviço
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="missao"
                  checked={destination === "missao"}
                  onChange={() => setDestination("missao")}
                />
                Missão
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="outro"
                  checked={destination === "outro"}
                  onChange={() => setDestination("outro")}
                />
                Outro
              </label>
            </div>
            <textarea
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
              placeholder="Observação (opcional)..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </section>
        )}

        <section className="flex flex-col gap-4 md:flex-row">
          {/* Câmera */}
          <div className="flex flex-col gap-3">
            <video
              ref={videoRef}
              className="h-64 rounded-lg border border-slate-800 bg-black"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="flex-1 space-y-4">
            {/* modo */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4"
                  value="cautela"
                  checked={mode === "cautela"}
                  onChange={() => {
                    setMode("cautela");
                    setRecognizedUser(null);
                    setRecognizeError(null);
                    setSelectedItemIds([]);
                    setDisturbances({});
                  }}
                />
                Cautela
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4"
                  value="descautela"
                  checked={mode === "descautela"}
                  onChange={() => {
                    setMode("descautela");
                    setRecognizedUser(null);
                    setRecognizeError(null);
                    setSelectedItemIds([]);
                    setDisturbances({});
                  }}
                />
                Descautela
              </label>
            </div>

            {/* info do usuário reconhecido na descautela */}
            {mode === "descautela" && (
              <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs">
                {recognizedUser ? (
                  <div className="space-y-1">
                    <div>
                      Usuário reconhecido:{" "}
                      <span className="font-semibold">
                        {recognizedUser.user_name}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      Confiança: {(recognizedUser.confidence * 100).toFixed(1)}%
                      {" • "}
                      Capturado em:{" "}
                      {new Date(recognizedUser.captured_at).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400">
                    Nenhum usuário reconhecido ainda. Capture o rosto para
                    listar os itens em posse dele.
                  </div>
                )}
                {recognizeError && (
                  <div className="mt-1 text-red-400">{recognizeError}</div>
                )}
              </div>
            )}

            {/* busca + lista de itens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium">Itens</h2>
                  <p className="text-xs text-slate-400">
                    {mode === "cautela"
                      ? "Mostrando apenas itens disponíveis."
                      : recognizedUser
                      ? "Mostrando apenas itens em posse do usuário reconhecido."
                      : "Reconheça o usuário para ver os itens em posse dele."}
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Buscar item..."
                  className="w-64 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>

              <div className="max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950">
                {filteredItems.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">
                    Nenhum item encontrado para os filtros atuais.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-800 text-sm">
                    {filteredItems.map((item) => {
                      const checked = selectedItemIds.includes(item.item_id);
                      return (
                        <li
                          key={item.item_id}
                          className="flex flex-col gap-2 px-3 py-2 hover:bg-slate-900/70">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={checked}
                              onChange={() => toggleItem(item.item_id)}
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">
                                  {item.item_name}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {item.item_type_name ?? "Sem tipo"}
                                </span>
                              </div>
                              <div className="mt-0.5 text-xs text-slate-400">
                                {item.serial_number && (
                                  <span className="mr-3">
                                    SN: {item.serial_number}
                                  </span>
                                )}
                                {item.asset_number && (
                                  <span className="mr-3">
                                    Patrimônio: {item.asset_number}
                                  </span>
                                )}
                                <span>Status: {item.status}</span>
                                {item.current_user_name && (
                                  <span className="ml-3">
                                    Em posse de: {item.current_user_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {mode === "descautela" && checked && (
                            <div className="ml-7">
                              <textarea
                                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                                placeholder="Alterações/danos observados neste item (opcional)..."
                                value={disturbances[item.item_id] ?? ""}
                                onChange={(e) =>
                                  handleDisturbanceChange(
                                    item.item_id,
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* botões */}
            {mode === "cautela" ? (
              <div className="flex gap-3">
                <button
                  disabled={loading || selectedItemIds.length === 0}
                  onClick={handleCautela}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {loading
                    ? "Processando..."
                    : "Cautelar selecionados com rosto"}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRecognizeForReturn}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {loading
                    ? "Reconhecendo..."
                    : "1) Reconhecer usuário na câmera"}
                </button>
                <button
                  type="button"
                  disabled={
                    loading || !recognizedUser || selectedItemIds.length === 0
                  }
                  onClick={handleConfirmDescautela}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {loading
                    ? "Processando..."
                    : "2) Descautelar itens selecionados"}
                </button>
              </div>
            )}

            {/* resultado bruto (debug) */}
            {result !== null && (
              <div className="mt-2 rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>
      </main>
    </RequireAuth>
  );
}
