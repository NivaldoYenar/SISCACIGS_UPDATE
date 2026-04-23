import numpy as np
import onnxruntime as ort
from PIL import Image
import cv2
from io import BytesIO
import face_detect


MODEL_PATH = "models/face_embedding.onnx"

_session = None
_OUTPUT_L2_NORMALIZE = True  # modelos de face normalmente assumem normalização L2


def get_session() -> ort.InferenceSession:
    """
    Lazy-load da sessão ONNX.
    """
    global _session
    if _session is None:
        print(f"[face_embed] Carregando modelo ONNX de {MODEL_PATH}...")
        _session = ort.InferenceSession(
            MODEL_PATH,
            providers=["CPUExecutionProvider"],
        )
        print("[face_embed] Modelo ONNX carregado")
    return _session


def load_model():
    """
    Mantém compatibilidade com o código antigo que chamava load_model() no startup.
    Agora só garante que a sessão existe.
    """
    get_session()


def preprocess_image(img: Image.Image) -> np.ndarray:
    img = img.convert("RGB")
    img = img.resize((112, 112))
    arr = np.asarray(img).astype("float32")
    arr = (arr / 255.0 - 0.5) / 0.5  # normalização exemplo
    arr = np.transpose(arr, (2, 0, 1))  # CHW
    arr = np.expand_dims(arr, axis=0)
    return arr


def compute_embedding_from_bytes(image_bytes: bytes) -> list[float]:
    """
    Lê bytes da imagem, detecta 1 rosto e calcula embedding com o mesmo
    pipeline usado no reconhecimento (get_embedding + extract_face).
    """
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    frame_rgb = np.asarray(img)

    face_rgb = face_detect.extract_face(frame_rgb)
    if face_rgb is None:
        raise ValueError("Nenhum rosto único detectado na imagem enviada")

    emb = get_embedding(face_rgb)

    # retorna como list[float] (DOUBLE PRECISION[])
    return emb.astype("float64").tolist()



def _preprocess_face_for_model(face_rgb: np.ndarray) -> np.ndarray:
    """
    face_rgb: imagem RGB do rosto já recortada.
    Saída: tensor float32 pronto pro modelo ONNX: shape (1, 3, H, W)
    """
    target_size = (112, 112)

    face_resized = cv2.resize(face_rgb, target_size, interpolation=cv2.INTER_LINEAR)

    face_float = face_resized.astype("float32") / 255.0
    face_float = (face_float - 0.5) / 0.5

    face_chw = np.transpose(face_float, (2, 0, 1))  # (3,112,112)
    face_batch = np.expand_dims(face_chw, axis=0)   # (1,3,112,112)

    return face_batch


def get_embedding(face_rgb: np.ndarray) -> np.ndarray:
    """
    Recebe imagem RGB recortada (da face_detect.extract_face).
    Retorna vetor de embedding float32 normalizado.
    """
    session = get_session()
    input_tensor = _preprocess_face_for_model(face_rgb)

    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name

    result = session.run([output_name], {input_name: input_tensor})

    emb = result[0][0].astype("float32")

    if _OUTPUT_L2_NORMALIZE:
        norm = np.linalg.norm(emb) + 1e-8
        emb = emb / norm

    return emb


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


def find_best_match(emb_now: np.ndarray, known_users: list):
    """
    known_users: [ { "user_id": str, "name": str, "embedding": np.ndarray(...) }, ... ]
    Retorna (melhor_user, melhor_score).
    """
    if len(known_users) == 0:
        return None, None

    best_user = None
    best_score = -1.0

    for u in known_users:
        score = cosine_similarity(emb_now, u["embedding"])
        if score > best_score:
            best_score = score
            best_user = u

    return best_user, best_score
