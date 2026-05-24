from app.mcp.descriptor_mapper import MCPDescriptorMapper
from app.mcp.models import MCPServerDefinition, MCPToolDescriptor
from app.tools.models import ToolKind

def test_mapper() -> None:
    s = MCPServerDefinition(server_id="srv", slug="fake", command="python", status="APPROVED")
    d = MCPToolDescriptor(server_id="srv", server_slug="fake", remote_name="search_docs", canonical_name="mcp.fake.search_docs", input_schema={"type":"object"}, descriptor_hash="sha256:a")
    t = MCPDescriptorMapper().to_tool_definition(s,d)
    assert t.kind == ToolKind.MCP_STDIO
