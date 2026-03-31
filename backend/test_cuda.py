import torch
import sys

def check_cuda():
    print("=== DBVPDFEditor - Diagnóstico GPU ===")
    print(f"Versión Python: {sys.version}")
    print(f"Versión PyTorch: {torch.__version__}")
    
    cuda_available = torch.cuda.is_available()
    print(f"¿CUDA Disponible?: {'SÍ (Modo Turbo Activo)' if cuda_available else 'NO (Modo CPU Lento)'}")
    
    if cuda_available:
        print(f"Nombre de la GPU: {torch.cuda.get_device_name(0)}")
        print(f"Capacidades CUDA: {torch.cuda.get_arch_list()}")
        print(f"Memoria Total: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    else:
        print("\n[!] Alerta: El sistema no detecta aceleración por hardware.")
        print("Causas probables:")
        print("1. No has instalado la versión de PyTorch con soporte CUDA (cu121).")
        print("2. No tienes instalados los drivers de NVIDIA actualizados.")
        print("3. Estás usando una versión de Python no soportada aún (como la 3.13).")

if __name__ == "__main__":
    check_cuda()
