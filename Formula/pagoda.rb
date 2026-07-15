class Pagoda < Formula
  desc "Target-agnostic validation framework for agentic software"
  homepage "https://github.com/petitbon/pagoda"
  url "https://github.com/petitbon/pagoda/releases/download/v0.3.3/pagoda-cli-standalone.tgz"
  version "0.3.3"
  sha256 "cda721d4e9b3c5d88e63feea5e4b9d63c449742828f849cfdd9f3ceab713d7c8"
  license "Apache-2.0"

  depends_on "node"

  def install
    package_root = buildpath/"package"
    source_root = package_root.directory? ? package_root : buildpath

    libexec.install source_root.children

    (bin/"pagoda").write <<~SH
      #!/usr/bin/env bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    SH
  end

  test do
    assert_match(/\A\d+\.\d+\.\d+/, shell_output("#{bin}/pagoda --version"))
  end
end
