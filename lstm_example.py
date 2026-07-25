import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

# 1. Generar datos de ejemplo (simulación)
# En un caso real, aquí cargarías tus propios datos (ej: archivos CSV)
X = np.random.rand(1000, 10)  # 1000 muestras, 10 características
y = np.random.randint(0, 2, 1000) # 1000 etiquetas binarias

# 2. Definir el modelo LSTM
model = Sequential()
# Capa LSTM: return_sequences=False para la capa final si solo queremos la salida de la secuencia
model.add(LSTM(50, input_shape=(X.shape[1],)))
model.add(Dense(1, activation='sigmoid')) # Capa de salida para clasificación binaria

# 3. Compilar el modelo
model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])

print("--- Modelo LSTM Definido ---")
model.summary()

# 4. Entrenar el modelo (con datos simulados)
print("\n--- Iniciando Entrenamiento del Modelo ---")
history = model.fit(X, y, epochs=10, batch_size=32, verbose=1)

print("\n--- Entrenamiento Finalizado ---")