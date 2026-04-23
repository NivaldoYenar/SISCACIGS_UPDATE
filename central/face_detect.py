import cv2
import numpy as np

_detector = None


def load_detector():
    """
    Carrega o Haar Cascade uma única vez.
    Pode ser chamado no startup ou sob demanda.
    """
    global _detector
    if _detector is not None:
        return

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)

    if detector.empty():
        raise RuntimeError(f"Falha ao carregar cascade em {cascade_path}")

    _detector = detector
    print("[face_detect] Detector carregado")


def extract_face(frame_rgb: np.ndarray, out_size: int = 160):
    """
    Recebe frame RGB (np.ndarray).
    Retorna recorte da face em RGB, redimensionado (out_size x out_size),
    ou None se não achar exatamente um rosto.
    """
    global _detector
    if _detector is None:
        load_detector()

    # agora sabemos que é RGB
    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)

    faces = _detector.detectMultiScale(
        gray,
        scaleFactor=1.2,
        minNeighbors=5,
        minSize=(60, 60),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    if len(faces) == 0:
        return None

    # pega o maior rosto (maior área)
    x, y, w, h = max(faces, key=lambda box: box[2] * box[3])

    # recorte direto em RGB
    face_rgb = frame_rgb[y : y + h, x : x + w]

    # normaliza tamanho pro modelo
    face_resized = cv2.resize(
        face_rgb,
        (out_size, out_size),
        interpolation=cv2.INTER_LINEAR,
    )

    return face_resized  # (out_size, out_size, 3) em RGB
