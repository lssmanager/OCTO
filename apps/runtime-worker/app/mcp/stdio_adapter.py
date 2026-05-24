from app.mcp.descriptor_mapper import MCPDescriptorMapper
from app.mcp.discovery_service import MCPDiscoveryService

class MCPStdioAdapter:
    def __init__(self, discovery_service: MCPDiscoveryService, mapper: MCPDescriptorMapper) -> None:
        self.discovery_service = discovery_service
        self.mapper = mapper
