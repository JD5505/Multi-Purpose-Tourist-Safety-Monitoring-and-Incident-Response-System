from Operations.load_model import model
import torch.nn as nn 
import torch

loss = nn.MSELoss()
def run_inference(data):
    with torch.no_grad():
        output = model(data)
        mse = loss(output, data)
        return mse.item()