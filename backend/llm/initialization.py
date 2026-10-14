from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
import config

primary_llm = ChatGroq(
    model = "openai/gpt-oss-120b",
    temperature = 0.5,
    api_key = config.groq_api_key,
    model_kwargs={"response_format": {"type": "json_object"}}    
)

secondary_llm = ChatGroq(
    model = "qwen/qwen3.8-27b",
    temperature = 0.5,
    api_key = config.groq_api_key,
    model_kwargs={"response_format": {"type": "json_object"}}
)

tertiary_llm = ChatGroq(
    model = "openai/gpt-oss-20b",
    temperature = 0.5,
    api_key = config.groq_api_key,
    model_kwargs={"response_format": {"type": "json_object"}}
)

final_llm = ChatGroq(
    model = "openai/gpt-oss-safeguard-20b",
    temperature = 0.5,
    api_key = config.groq_api_key,
    model_kwargs={"response_format": {"type": "json_object"}}
)

llm = primary_llm.with_fallbacks([secondary_llm, tertiary_llm, final_llm])

system_prompt = """
    You are an anomaly analyzer. create a detailed anomaly report from tourist data input.The
    input consists of user's current location data, trajectory data, model output in MSELoss (current threshold
    is 0.55 for anomalies) infer the tourist's current condition, find out the direction user is headed towards using geofence 
    data and user trajectory data. but do not make up any possibilities or scenarios.
    output in JSON only
    example:
    {{
    "risk_category": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    "message": "Your report here",
    "risk_score": "0 to 1",
    "recommended_actions": "Tell the recommended action according to the situation"
    }}
                """

prompt = ChatPromptTemplate.from_messages([
    ('system', system_prompt),
    ('user', "{user_input}")
])

parser = StrOutputParser()

llm_chain = prompt | llm | parser